/**
 * Live crypto prices (CLAUDE.md §5).
 *
 * CoinGecko, chosen because it covers the small caps and dust in Holdings and
 * returns ZAR natively — no second FX hop, no rounding drift between a USD
 * price and a rand conversion.
 *
 * Server-only and cached. The browser never talks to CoinGecko; it polls our
 * own endpoint, which reads this cache (§2.2). That is the structural fix for
 * the CORS/key-leak failure that killed the earlier prototypes.
 */
import "server-only";

import { env } from "./env";

const PUBLIC_API = "https://api.coingecko.com/api/v3";
const PRO_API = "https://pro-api.coingecko.com/api/v3";

/**
 * CoinGecko's public tier allows roughly 5-15 calls/minute. One batched call
 * every 45s sits comfortably inside that even with several tabs open, because
 * every caller shares this one cache entry.
 */
const CACHE_TTL_MS = 45_000;

export type CoinPrice = {
  coingeckoId: string;
  zar: number;
  usd: number;
  /** 24h change in percent, ZAR-denominated. */
  change24hPct: number | null;
  /** 7d / 30d change in percent, ZAR-denominated (coins/markets endpoint).
      Null when that call fails — the longer windows go quiet, prices don't. */
  change7dPct: number | null;
  change30dPct: number | null;
};

export type PriceSnapshot = {
  prices: Map<string, CoinPrice>;
  /** When the upstream data was actually fetched — drives "updated Xs ago". */
  fetchedAt: number;
  /** True when this response came from cache rather than a fresh call. */
  cached: boolean;
  /** Set when the upstream call failed and stale data is being served. */
  staleReason: string | null;
};

type CacheEntry = { at: number; prices: Map<string, CoinPrice> };

let cache: CacheEntry | null = null;
/** De-dupes concurrent requests so ten simultaneous loads make one call. */
let inFlight: Promise<CacheEntry> | null = null;

function endpoint(path: string): { url: string; headers: HeadersInit } {
  const key = env.priceApiKey;
  if (key) {
    return {
      url: `${PRO_API}${path}`,
      headers: { "x-cg-pro-api-key": key },
    };
  }
  return { url: `${PUBLIC_API}${path}`, headers: {} };
}

type SimplePriceResponse = Record<
  string,
  { zar?: number; usd?: number; zar_24h_change?: number }
>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * CoinGecko's public tier rate-limits in bursts and answers 429 with a
 * Retry-After. Without this retry a single transient 429 drops *every* coin to
 * its stored Airtable price — which is the worst outcome for a screen whose
 * entire purpose is live prices, and it fails quietly because the fallback
 * looks like real data.
 */
async function fetchWithRetry(
  url: string,
  headers: HeadersInit,
  attempt = 0,
): Promise<Response> {
  const response = await fetch(url, { headers, cache: "no-store" });

  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 10_000)
      : 2 ** attempt * 800;
    await sleep(backoffMs);
    return fetchWithRetry(url, headers, attempt + 1);
  }

  return response;
}

async function fetchPrices(ids: string[]): Promise<Map<string, CoinPrice>> {
  const prices = new Map<string, CoinPrice>();
  if (ids.length === 0) return prices;

  // CoinGecko accepts long id lists, but chunk anyway to stay under URL limits.
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    const params = new URLSearchParams({
      ids: chunk.join(","),
      vs_currencies: "zar,usd",
      include_24hr_change: "true",
    });

    const { url, headers } = endpoint(`/simple/price?${params}`);
    const response = await fetchWithRetry(url, headers);

    if (!response.ok) {
      throw new Error(`CoinGecko responded ${response.status}`);
    }

    const data = (await response.json()) as SimplePriceResponse;
    for (const [coingeckoId, value] of Object.entries(data)) {
      if (typeof value.zar !== "number" || typeof value.usd !== "number") continue;
      prices.set(coingeckoId, {
        coingeckoId,
        zar: value.zar,
        usd: value.usd,
        change24hPct:
          typeof value.zar_24h_change === "number" ? value.zar_24h_change : null,
        change7dPct: null,
        change30dPct: null,
      });
    }
  }

  await addWindowChanges(prices, ids);

  return prices;
}

type MarketsRow = {
  id: string;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
};

/**
 * 7d / 30d moves come from /coins/markets — /simple/price only offers 24h.
 * A separate, best-effort call: if it fails, the longer windows read "—" but
 * live prices (the screen's whole point) are untouched. 60d/90d are NOT
 * available from any batched CoinGecko endpoint; those windows are computed
 * from the app's own snapshots instead (lib/server/crypto.ts).
 */
async function addWindowChanges(
  prices: Map<string, CoinPrice>,
  ids: string[],
): Promise<void> {
  try {
    for (let index = 0; index < ids.length; index += 250) {
      const chunk = ids.slice(index, index + 250);
      const params = new URLSearchParams({
        vs_currency: "zar",
        ids: chunk.join(","),
        price_change_percentage: "7d,30d",
        per_page: "250",
        sparkline: "false",
      });
      const { url, headers } = endpoint(`/coins/markets?${params}`);
      const response = await fetchWithRetry(url, headers);
      if (!response.ok) throw new Error(`CoinGecko markets responded ${response.status}`);

      const rows = (await response.json()) as MarketsRow[];
      for (const row of rows) {
        const price = prices.get(row.id);
        if (!price) continue;
        price.change7dPct =
          typeof row.price_change_percentage_7d_in_currency === "number"
            ? row.price_change_percentage_7d_in_currency
            : null;
        price.change30dPct =
          typeof row.price_change_percentage_30d_in_currency === "number"
            ? row.price_change_percentage_30d_in_currency
            : null;
      }
    }
  } catch (error) {
    console.error("[prices] window changes unavailable", error);
  }
}

/**
 * Returns prices for the given CoinGecko ids, cached for CACHE_TTL_MS.
 *
 * On upstream failure it serves the last good cache rather than throwing, and
 * says so via `staleReason`. A wealth dashboard that shows slightly old prices
 * with an honest "stale" marker is far more useful than one that shows an
 * error page — but it must never pretend stale data is live, which is why the
 * reason is surfaced all the way to the UI.
 */
export async function getPrices(ids: string[]): Promise<PriceSnapshot> {
  const unique = [...new Set(ids.filter(Boolean))].sort();

  const fresh = cache && Date.now() - cache.at < CACHE_TTL_MS;
  const covered =
    cache && unique.every((id) => cache!.prices.has(id) || cache!.prices.size > 0);

  if (fresh && covered) {
    return {
      prices: cache!.prices,
      fetchedAt: cache!.at,
      cached: true,
      staleReason: null,
    };
  }

  if (!inFlight) {
    inFlight = (async () => {
      const prices = await fetchPrices(unique);
      const entry = { at: Date.now(), prices };
      cache = entry;
      return entry;
    })().finally(() => {
      inFlight = null;
    });
  }

  try {
    const entry = await inFlight;
    return { prices: entry.prices, fetchedAt: entry.at, cached: false, staleReason: null };
  } catch (error) {
    if (cache) {
      return {
        prices: cache.prices,
        fetchedAt: cache.at,
        cached: true,
        staleReason: error instanceof Error ? error.message : "price fetch failed",
      };
    }
    // Nothing cached and upstream is down — callers fall back to stored
    // Airtable values and mark every price as unavailable.
    return {
      prices: new Map(),
      fetchedAt: Date.now(),
      cached: false,
      staleReason: error instanceof Error ? error.message : "price fetch failed",
    };
  }
}

/** Test seam / manual refresh — drops the cache so the next read is live. */
export function invalidatePriceCache(): void {
  cache = null;
}
