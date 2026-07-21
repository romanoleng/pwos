/**
 * Symbol → CoinGecko id resolution.
 *
 * Replaces the retired n8n pipeline. Three sources, in order of trust:
 *
 *   1. market-data — the CoinGecko ID column in Airtable. Romano's curated
 *      choice, always wins.
 *   2. alias       — hardcoded for the cases §5 names explicitly.
 *   3. inferred    — looked up from CoinGecko's search index at runtime.
 *
 * Inference exists because symbols are NOT unique on CoinGecko: dozens of
 * tokens call themselves BTC, and several are worthless copies of a real coin.
 * Picking the wrong one would show a confidently incorrect balance, which is
 * the worst failure this app can have.
 *
 * So inference is deliberately conservative — exact symbol match, ranked by
 * market cap, and anything below the rank floor is refused rather than
 * guessed. Every inferred id is reported to the UI as unconfirmed so Romano
 * can accept it into Airtable rather than it quietly becoming truth.
 */
import "server-only";

import { FIELDS, TABLES } from "@/lib/airtable-fields";

import { listRecords, stringCell } from "./airtable";
import { env } from "./env";

export type IdSource = "market-data" | "alias" | "inferred";

export type ResolvedId = {
  symbol: string;
  coingeckoId: string;
  source: IdSource;
  /** Populated for inferred ids so the UI can show what it matched. */
  name?: string;
  marketCapRank?: number;
};

/** Cases §5 names explicitly, plus symbols whose CoinGecko id is unguessable. */
const ALIASES: Record<string, string> = {
  RENDER: "render-token",
  RNDR: "render-token",
  POL: "polygon-ecosystem-token",
  MATIC: "polygon-ecosystem-token",
};

/**
 * A coin outside the top few thousand by market cap is far more likely to be a
 * namesake token than the asset actually held. Refuse rather than guess.
 */
const MAX_INFERRED_RANK = 3000;

const PUBLIC_API = "https://api.coingecko.com/api/v3";
const PRO_API = "https://pro-api.coingecko.com/api/v3";

/** Search results change rarely; a day is plenty and keeps us well under rate limits. */
const INFERENCE_TTL_MS = 24 * 60 * 60 * 1000;

const inferenceCache = new Map<
  string,
  { at: number; result: ResolvedId | null }
>();

type SearchResponse = {
  coins?: {
    id: string;
    symbol: string;
    name: string;
    market_cap_rank: number | null;
  }[];
};

async function inferFromCoinGecko(symbol: string): Promise<ResolvedId | null> {
  const cached = inferenceCache.get(symbol);
  if (cached && Date.now() - cached.at < INFERENCE_TTL_MS) return cached.result;

  const key = env.priceApiKey;
  const base = key ? PRO_API : PUBLIC_API;
  const headers: HeadersInit = key ? { "x-cg-pro-api-key": key } : {};

  let result: ResolvedId | null = null;
  try {
    const response = await fetch(
      `${base}/search?query=${encodeURIComponent(symbol)}`,
      { headers, cache: "no-store" },
    );
    if (response.ok) {
      const data = (await response.json()) as SearchResponse;
      const candidate = (data.coins ?? [])
        // Exact symbol match only — a fuzzy name match is how you end up
        // pricing a holding against an unrelated token.
        .filter((coin) => coin.symbol?.toUpperCase() === symbol)
        .filter(
          (coin) =>
            typeof coin.market_cap_rank === "number" &&
            coin.market_cap_rank <= MAX_INFERRED_RANK,
        )
        .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9))[0];

      if (candidate) {
        result = {
          symbol,
          coingeckoId: candidate.id,
          source: "inferred",
          name: candidate.name,
          marketCapRank: candidate.market_cap_rank ?? undefined,
        };
      }
    }
  } catch {
    // Inference is best-effort. A failure just means the coin falls back to
    // its stored Airtable price, exactly as before.
    result = null;
  }

  inferenceCache.set(symbol, { at: Date.now(), result });
  return result;
}

/**
 * Resolves ids for the given symbols. Airtable first, then aliases, then
 * inference only for whatever is still unresolved.
 */
export async function resolveCoinIds(
  symbols: readonly string[],
): Promise<Map<string, ResolvedId>> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const resolved = new Map<string, ResolvedId>();

  const records = await listRecords(TABLES.marketData, {
    fieldIds: [FIELDS.marketData.symbol, FIELDS.marketData.coingeckoId],
  });

  for (const record of records) {
    const symbol = stringCell(record, FIELDS.marketData.symbol)?.toUpperCase();
    const id = stringCell(record, FIELDS.marketData.coingeckoId);
    if (symbol && id && wanted.includes(symbol)) {
      resolved.set(symbol, { symbol, coingeckoId: id, source: "market-data" });
    }
  }

  for (const symbol of wanted) {
    if (!resolved.has(symbol) && ALIASES[symbol]) {
      resolved.set(symbol, {
        symbol,
        coingeckoId: ALIASES[symbol],
        source: "alias",
      });
    }
  }

  const unresolved = wanted.filter((symbol) => !resolved.has(symbol));

  // Sequential, not parallel: the public tier rate-limits aggressively and
  // this only runs for symbols Airtable doesn't already cover.
  for (const symbol of unresolved) {
    const inferred = await inferFromCoinGecko(symbol);
    if (inferred) resolved.set(symbol, inferred);
  }

  return resolved;
}

/** Test seam. */
export function clearInferenceCache(): void {
  inferenceCache.clear();
}
