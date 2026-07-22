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
import { assessMilestones, parseMilestones } from "@/lib/crypto/milestones";
import type {
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

    if (live) {
      priceZar = live.zar;
      priceUsd = live.usd;
      change24hPct = live.change24hPct;
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

  // 24h move is value-weighted across priced holdings only. Including unpriced
  // positions at 0% would understate a real move.
  let change24hZar: number | null = null;
  const priced = holdings.filter(
    (h) => h.change24hPct !== null && h.valueZar !== null && h.valueZar > 0,
  );
  if (priced.length > 0) {
    change24hZar = priced.reduce((sum, h) => {
      const previous = h.valueZar! / (1 + h.change24hPct! / 100);
      return sum + (h.valueZar! - previous);
    }, 0);
  }
  const pricedValue = priced.reduce((sum, h) => sum + (h.valueZar ?? 0), 0);
  const change24hPct =
    change24hZar !== null && pricedValue - change24hZar > 0
      ? (change24hZar / (pricedValue - change24hZar)) * 100
      : null;

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

  return {
    totals: {
      valueZar: totalValue,
      investedZar: totalInvested,
      pnlZar: pnl,
      pnlPct: totalInvested > 0 ? (pnl / totalInvested) * 100 : null,
      change24hPct,
      change24hZar,
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
