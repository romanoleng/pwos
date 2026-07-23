/**
 * Crypto portfolio assembly (CLAUDE.md §5).
 *
 * Holdings is the source of truth for positions. Live prices overlay it, and
 * value / P&L / weights / milestone distances are recomputed on every load.
 * The stored Airtable price is a *fallback only* — never a display value when
 * a live price exists, because it is often days old.
 */
import "server-only";

import { CORE_5, FREEDOM_TARGET_ZAR, WALLET_ORDER } from "@/lib/constants";
import { toLocalISODate } from "@/lib/crypto/history";
import { assessMilestones, parseMilestones } from "@/lib/crypto/milestones";
import type {
  ChangeWindow,
  Core5Position,
  Holding,
  Mover,
  Portfolio,
  PriceSource,
  WalletGroup,
} from "@/lib/crypto/types";

import { resolveCoinIds, type ResolvedId } from "./coin-ids";
import { money, moneyOrNull, sql } from "./db";
import { getPrices } from "./prices";

type HoldingRow = {
  id: string; symbol: string; coin: string | null; wallet: string;
  quantity: string; invested_zar: string; stored_price_zar: string | null;
  category: string | null;
  milestone_1: string | null; milestone_2: string | null; milestone_3: string | null;
  milestone_4: string | null; milestone_5: string | null;
};

/** Unknown wallets sort last but are never dropped — see Tangem Cold Wallet. */
function walletRank(wallet: string): number {
  const index = (WALLET_ORDER as readonly string[]).indexOf(wallet);
  return index === -1 ? WALLET_ORDER.length : index;
}

/**
 * Core 5 coins are held across several wallets (BTC sits in both Luno and
 * Tangem, ETH in three). A "Core 5" card listing ten rows reads as a bug, so
 * positions are summed per symbol and the wallet count is kept alongside.
 */
function aggregateCore5(holdings: Holding[]): Core5Position[] {
  const bySymbol = new Map<string, Holding[]>();
  for (const holding of holdings.filter((h) => h.isCore5)) {
    const list = bySymbol.get(holding.symbol) ?? [];
    list.push(holding);
    bySymbol.set(holding.symbol, list);
  }

  return [...bySymbol.entries()]
    .map(([symbol, list]) => {
      const valueZar = list.reduce((sum, h) => sum + (h.valueZar ?? 0), 0);
      const investedZar = list.reduce((sum, h) => sum + h.investedZar, 0);
      const pnlZar = valueZar - investedZar;
      // Price and 24h move are per-coin, not per-position, so take the first
      // live figure rather than averaging identical values.
      const priced = list.find((h) => h.priceZar !== null);
      return {
        symbol,
        quantity: list.reduce((sum, h) => sum + h.quantity, 0),
        priceZar: priced?.priceZar ?? null,
        change24hPct: priced?.change24hPct ?? null,
        valueZar,
        investedZar,
        pnlZar,
        pnlPct: investedZar > 0 ? (pnlZar / investedZar) * 100 : null,
        walletCount: list.length,
      } satisfies Core5Position;
    })
    .sort((a, b) => b.valueZar - a.valueZar);
}

export async function getPortfolio(): Promise<Portfolio> {
  // Archived positions leave the app but stay in the table (§9b).
  const records = await sql<HoldingRow>`
    select id::text, symbol, coin, wallet, quantity, invested_zar, stored_price_zar,
           category, milestone_1, milestone_2, milestone_3, milestone_4, milestone_5
    from holdings where not archived order by symbol`;
  const [{ n: archived }] = await sql<{ n: string }>`
    select count(*)::text as n from holdings where archived`;
  const archivedCount = Number(archived);

  const symbols = records.map((r) => r.symbol.toUpperCase());

  const idsBySymbol = await resolveCoinIds(symbols);

  // Only request prices for coins actually held.
  const wanted = new Set<string>();
  for (const record of records) {
    const resolved = idsBySymbol.get(record.symbol.toUpperCase());
    if (resolved) wanted.add(resolved.coingeckoId);
  }

  const snapshot = await getPrices([...wanted]);

  const fallbackSymbols: string[] = [];
  const unpricedSymbols: string[] = [];
  /** Ids the app guessed rather than read from Airtable — must be confirmed. */
  const inferredIds: ResolvedId[] = [];

  const holdings: Holding[] = records.map((record) => {
    const symbol = record.symbol.toUpperCase();
    const wallet = record.wallet;
    const quantity = money(record.quantity);
    const investedZar = money(record.invested_zar);

    const resolved = idsBySymbol.get(symbol);
    const live = resolved ? snapshot.prices.get(resolved.coingeckoId) : undefined;
    if (live && resolved?.source === "inferred") inferredIds.push(resolved);

    let priceZar: number | null = null;
    let priceUsd: number | null = null;
    let priceSource: PriceSource = "none";
    let change24hPct: number | null = null;
    let change7dPct: number | null = null;
    let change30dPct: number | null = null;

    if (live) {
      priceZar = live.zar;
      priceUsd = live.usd;
      change24hPct = live.change24hPct;
      change7dPct = live.change7dPct;
      change30dPct = live.change30dPct;
      priceSource = "live";
    } else {
      // §5: coins with no provider id (ECNMG, MISC) use the stored value.
      const stored = moneyOrNull(record.stored_price_zar);
      if (stored !== null && stored > 0) {
        priceZar = stored;
        priceSource = "airtable-fallback";
        fallbackSymbols.push(symbol);
      } else {
        unpricedSymbols.push(symbol);
      }
    }

    const valueZar = priceZar !== null ? priceZar * quantity : null;
    const pnlZar = valueZar !== null ? valueZar - investedZar : null;
    const pnlPct =
      pnlZar !== null && investedZar > 0 ? (pnlZar / investedZar) * 100 : null;

    const milestones = parseMilestones({
      m1: record.milestone_1, m2: record.milestone_2, m3: record.milestone_3,
      m4: record.milestone_4, m5: record.milestone_5,
    });
    const assessment = assessMilestones(milestones, priceZar);

    return {
      recordId: record.id,
      symbol,
      coin: record.coin,
      wallet,
      quantity,
      priceZar,
      priceUsd,
      priceSource,
      change24hPct,
      change7dPct,
      change30dPct,
      investedZar,
      valueZar,
      pnlZar,
      pnlPct,
      weightPct: null, // filled once the total is known
      isCore5: (CORE_5 as readonly string[]).includes(symbol),
      category: record.category,
      milestones,
      milestoneStatuses: assessment.all,
      nextMilestone: assessment.next,
      lastHitMilestone: assessment.lastHit,
      milestonesHitCount: assessment.hitCount,
    } satisfies Holding;
  });

  const totalValue = holdings.reduce((sum, h) => sum + (h.valueZar ?? 0), 0);
  const totalInvested = holdings.reduce((sum, h) => sum + h.investedZar, 0);

  for (const holding of holdings) {
    holding.weightPct =
      totalValue > 0 && holding.valueZar !== null
        ? (holding.valueZar / totalValue) * 100
        : null;
  }

  // A window's move is value-weighted across priced holdings only. Including
  // unpriced positions at 0% would understate a real move.
  function liveWindow(pctOf: (h: Holding) => number | null): ChangeWindow {
    const priced = holdings.filter(
      (h) => pctOf(h) !== null && h.valueZar !== null && h.valueZar > 0,
    );
    if (priced.length === 0) return null;
    const zar = priced.reduce((sum, h) => {
      const previous = h.valueZar! / (1 + pctOf(h)! / 100);
      return sum + (h.valueZar! - previous);
    }, 0);
    const pricedValue = priced.reduce((sum, h) => sum + (h.valueZar ?? 0), 0);
    if (pricedValue - zar <= 0) return null;
    return { zar, pct: (zar / (pricedValue - zar)) * 100, basis: "live" };
  }

  const window24h = liveWindow((h) => h.change24hPct);
  const change24hZar = window24h?.zar ?? null;
  const change24hPct = window24h?.pct ?? null;

  const byWallet = new Map<string, Holding[]>();
  for (const holding of holdings) {
    const list = byWallet.get(holding.wallet) ?? [];
    list.push(holding);
    byWallet.set(holding.wallet, list);
  }

  const wallets: WalletGroup[] = [...byWallet.entries()]
    .map(([wallet, list]) => {
      const value = list.reduce((sum, h) => sum + (h.valueZar ?? 0), 0);
      const invested = list.reduce((sum, h) => sum + h.investedZar, 0);
      const pnl = value - invested;
      return {
        wallet,
        holdings: [...list].sort((a, b) => (b.valueZar ?? 0) - (a.valueZar ?? 0)),
        valueZar: value,
        investedZar: invested,
        pnlZar: pnl,
        pnlPct: invested > 0 ? (pnl / invested) * 100 : null,
        weightPct: totalValue > 0 ? (value / totalValue) * 100 : 0,
      } satisfies WalletGroup;
    })
    .sort((a, b) => {
      const rank = walletRank(a.wallet) - walletRank(b.wallet);
      return rank !== 0 ? rank : b.valueZar - a.valueZar;
    });

  // A 24h move belongs to the coin, not the position. Holding ONDO in two
  // wallets must not list it twice; values are summed across wallets instead.
  const moversBySymbol = new Map<string, Mover>();
  for (const holding of holdings) {
    if (holding.change24hPct === null || holding.priceZar === null) continue;
    const existing = moversBySymbol.get(holding.symbol);
    if (existing) {
      existing.valueZar += holding.valueZar ?? 0;
      if (existing.wallet !== holding.wallet) existing.wallet = "multiple wallets";
    } else {
      moversBySymbol.set(holding.symbol, {
        symbol: holding.symbol,
        wallet: holding.wallet,
        change24hPct: holding.change24hPct,
        priceZar: holding.priceZar,
        valueZar: holding.valueZar ?? 0,
      });
    }
  }
  const movers: Mover[] = [...moversBySymbol.values()];

  const sortedByChange = [...movers].sort((a, b) => b.change24hPct - a.change24hPct);

  const pnl = totalValue - totalInvested;

  // 60d/90d: no batched CoinGecko endpoint reaches that far back, so these
  // come from the app's own daily snapshots — as the change in unrealised
  // P&L, not raw value, so the monthly DCA deposit can't read as profit.
  const [d60, d90] = await snapshotWindows(pnl, [60, 90]);

  return {
    totals: {
      valueZar: totalValue,
      investedZar: totalInvested,
      pnlZar: pnl,
      pnlPct: totalInvested > 0 ? (pnl / totalInvested) * 100 : null,
      change24hPct,
      change24hZar,
      windows: {
        "24h": window24h,
        "7d": liveWindow((h) => h.change7dPct),
        "30d": liveWindow((h) => h.change30dPct),
        "60d": d60,
        "90d": d90,
      },
      freedomProgressPct: (totalValue / FREEDOM_TARGET_ZAR) * 100,
      freedomRemainingZar: Math.max(0, FREEDOM_TARGET_ZAR - totalValue),
    },
    wallets,
    core5: aggregateCore5(holdings),
    gainers: sortedByChange.filter((m) => m.change24hPct > 0).slice(0, 5),
    losers: sortedByChange
      .filter((m) => m.change24hPct < 0)
      .reverse()
      .slice(0, 5),
    holdings: [...holdings].sort((a, b) => (b.valueZar ?? 0) - (a.valueZar ?? 0)),
    milestoneHits: holdings
      .filter((h) => h.milestonesHitCount > 0 && h.priceSource === "live")
      .sort(
        (a, b) =>
          (b.lastHitMilestone?.milestone.level ?? 0) -
          (a.lastHitMilestone?.milestone.level ?? 0),
      ),
    meta: {
      pricesFetchedAt: snapshot.fetchedAt,
      pricesCached: snapshot.cached,
      staleReason: snapshot.staleReason,
      fallbackSymbols: [...new Set(fallbackSymbols)],
      unpricedSymbols: [...new Set(unpricedSymbols)],
      inferredIds,
      holdingsCount: holdings.length,
      archivedCount,
    },
  };
}

/**
 * The change in unrealised P&L versus the stored snapshot nearest each target,
 * accepted only within a ±15-day tolerance — a "60d" figure measured against
 * a 100-day-old snapshot would be a quiet lie. Null (window reads "—") until
 * daily snapshots reach far enough back; % is against the snapshot's value.
 */
async function snapshotWindows(
  pnlNow: number,
  daysList: number[],
): Promise<ChangeWindow[]> {
  const TOLERANCE_DAYS = 15;
  try {
    const maxDays = Math.max(...daysList) + TOLERANCE_DAYS;
    const rows = await sql<{ snapshot_on: string; value_zar: string; pnl_zar: string }>`
      select snapshot_on::text, value_zar, pnl_zar from portfolio_snapshots
      where snapshot_on >= (now() at time zone 'Africa/Johannesburg')::date - ${maxDays}
      order by snapshot_on`;
    if (rows.length === 0) return daysList.map(() => null);

    const todayMs = Date.parse(`${toLocalISODate(new Date())}T00:00:00Z`);
    return daysList.map((days) => {
      let best: { row: (typeof rows)[number]; offDays: number } | null = null;
      for (const row of rows) {
        const date = String(row.snapshot_on).slice(0, 10);
        const ageDays = Math.round((todayMs - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
        const offDays = Math.abs(ageDays - days);
        if (offDays <= TOLERANCE_DAYS && (!best || offDays < best.offDays)) {
          best = { row, offDays };
        }
      }
      if (!best) return null;
      const thenValue = money(best.row.value_zar);
      if (thenValue <= 0) return null;
      const zar = pnlNow - money(best.row.pnl_zar);
      return {
        zar,
        pct: (zar / thenValue) * 100,
        basis: "snapshot" as const,
        since: String(best.row.snapshot_on).slice(0, 10),
      };
    });
  } catch (error) {
    console.error("[snapshotWindows]", error);
    return daysList.map(() => null);
  }
}
