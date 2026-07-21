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
  Holding,
  Mover,
  Portfolio,
  PriceSource,
  WalletGroup,
} from "@/lib/crypto/types";

import {
  FIELDS,
  TABLES,
  listRecords,
  numberCell,
  stringCell,
  type AirtableRecord,
} from "./airtable";
import { resolveCoinIds, type ResolvedId } from "./coin-ids";
import { getPrices } from "./prices";

const HOLDING_FIELDS = [
  FIELDS.holdings.coin,
  FIELDS.holdings.symbol,
  FIELDS.holdings.wallet,
  FIELDS.holdings.quantity,
  FIELDS.holdings.investedZar,
  FIELDS.holdings.priceZar,
  FIELDS.holdings.valueZar,
  FIELDS.holdings.category,
  FIELDS.holdings.m1,
  FIELDS.holdings.m2,
  FIELDS.holdings.m3,
  FIELDS.holdings.m4,
  FIELDS.holdings.m5,
] as const;

/** Unknown wallets sort last but are never dropped — see Tangem Cold Wallet. */
function walletRank(wallet: string): number {
  const index = (WALLET_ORDER as readonly string[]).indexOf(wallet);
  return index === -1 ? WALLET_ORDER.length : index;
}

export async function getPortfolio(): Promise<Portfolio> {
  const records = await listRecords(TABLES.holdings, { fieldIds: HOLDING_FIELDS });

  const symbols = records
    .map((record) => stringCell(record, FIELDS.holdings.symbol)?.toUpperCase())
    .filter((symbol): symbol is string => Boolean(symbol));

  const idsBySymbol = await resolveCoinIds(symbols);

  // Only request prices for coins actually held.
  const wanted = new Set<string>();
  for (const record of records) {
    const symbol = stringCell(record, FIELDS.holdings.symbol)?.toUpperCase();
    const resolved = symbol ? idsBySymbol.get(symbol) : undefined;
    if (resolved) wanted.add(resolved.coingeckoId);
  }

  const snapshot = await getPrices([...wanted]);

  const fallbackSymbols: string[] = [];
  const unpricedSymbols: string[] = [];
  /** Ids the app guessed rather than read from Airtable — must be confirmed. */
  const inferredIds: ResolvedId[] = [];

  const holdings: Holding[] = records.map((record: AirtableRecord) => {
    const symbol = (stringCell(record, FIELDS.holdings.symbol) ?? "—").toUpperCase();
    const wallet = stringCell(record, FIELDS.holdings.wallet) ?? "Unassigned";
    const quantity = numberCell(record, FIELDS.holdings.quantity) ?? 0;
    const investedZar = numberCell(record, FIELDS.holdings.investedZar) ?? 0;

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
      const stored = numberCell(record, FIELDS.holdings.priceZar);
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
      m1: stringCell(record, FIELDS.holdings.m1),
      m2: stringCell(record, FIELDS.holdings.m2),
      m3: stringCell(record, FIELDS.holdings.m3),
      m4: stringCell(record, FIELDS.holdings.m4),
      m5: stringCell(record, FIELDS.holdings.m5),
    });
    const assessment = assessMilestones(milestones, priceZar);

    return {
      recordId: record.id,
      symbol,
      coin: stringCell(record, FIELDS.holdings.coin),
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
      category: stringCell(record, FIELDS.holdings.category),
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

  const movers: Mover[] = holdings
    .filter((h) => h.change24hPct !== null && h.priceZar !== null)
    .map((h) => ({
      symbol: h.symbol,
      wallet: h.wallet,
      change24hPct: h.change24hPct!,
      priceZar: h.priceZar!,
      valueZar: h.valueZar ?? 0,
    }));

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
    core5: holdings
      .filter((h) => h.isCore5)
      .sort((a, b) => (b.valueZar ?? 0) - (a.valueZar ?? 0)),
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
    },
  };
}
