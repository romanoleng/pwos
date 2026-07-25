/**
 * "All coins" view — a flat list with one row per coin, totalled across every
 * wallet that coin sits in (Romano's ask, 2026-07-25, from a portfolio-app
 * screenshot). Pure functions, no React or server imports, so the aggregation
 * and sorting are unit-testable.
 *
 * Phase A works entirely from data the app already has (24h / 7d / 30d change,
 * live ZAR + USD prices, holdings and P&L). Volume / market cap / FDV and the
 * 1h / 1y windows are a later, small extension to the CoinGecko markets call.
 */
import type { Holding } from "./types";

export type Timeframe = "24h" | "7d" | "30d";
export type CoinColumn = "price" | "holdings" | "pnl" | "invested";
export type CoinSort = "value" | "change" | "holdings" | "symbol" | "pnl" | "invested";
export type SortDir = "asc" | "desc";

export type CoinsPrefs = {
  timeframe: Timeframe;
  /** 1–2 columns shown to the right of the coin name, in order. */
  columns: CoinColumn[];
  currency: "zar" | "usd";
  showOverview: boolean;
  sort: CoinSort;
  dir: SortDir;
};

export const DEFAULT_COINS_PREFS: CoinsPrefs = {
  timeframe: "24h",
  columns: ["price", "holdings"],
  currency: "zar",
  showOverview: true,
  sort: "value",
  dir: "desc",
};

export const ALL_COLUMNS: { key: CoinColumn; label: string }[] = [
  { key: "price", label: "Price + % Change" },
  { key: "holdings", label: "Total Holdings" },
  { key: "invested", label: "Total Invested" },
  { key: "pnl", label: "Total P&L" },
];

/** One coin, aggregated across every wallet holding it. */
export type CoinRow = {
  symbol: string;
  coin: string | null;
  quantity: number;
  valueZar: number;
  investedZar: number;
  pnlZar: number | null;
  priceZar: number | null;
  priceUsd: number | null;
  change: Record<Timeframe, number | null>;
  /** How many wallets hold it — so the total isn't misread as one position. */
  walletCount: number;
};

/**
 * Collapse holdings to one row per coin. A coin's price and % change are the
 * same in every wallet, so they're taken from whichever holding has them;
 * quantity, value and cost basis are summed.
 */
export function aggregateByCoin(holdings: Holding[]): CoinRow[] {
  const map = new Map<string, CoinRow>();

  for (const h of holdings) {
    const existing = map.get(h.symbol);
    if (existing) {
      existing.quantity += h.quantity;
      existing.valueZar += h.valueZar ?? 0;
      existing.investedZar += h.investedZar;
      existing.walletCount += 1;
      // Fill a price/change only if we don't have one yet — same coin, same price.
      if (existing.priceZar === null && h.priceZar !== null) existing.priceZar = h.priceZar;
      if (existing.priceUsd === null && h.priceUsd !== null) existing.priceUsd = h.priceUsd;
      for (const tf of ["24h", "7d", "30d"] as Timeframe[]) {
        if (existing.change[tf] === null) existing.change[tf] = changeOf(h, tf);
      }
    } else {
      map.set(h.symbol, {
        symbol: h.symbol,
        coin: h.coin,
        quantity: h.quantity,
        valueZar: h.valueZar ?? 0,
        investedZar: h.investedZar,
        pnlZar: null, // computed once after summing, so it stays honest
        priceZar: h.priceZar,
        priceUsd: h.priceUsd,
        change: { "24h": h.change24hPct, "7d": h.change7dPct, "30d": h.change30dPct },
        walletCount: 1,
      });
    }
  }

  // P&L only where there's both a value and a cost — a coin with no cost basis
  // shows "—", never a fake zero (CLAUDE.md: don't soften the gaps).
  return [...map.values()].map((row) => ({
    ...row,
    pnlZar: row.investedZar > 0 ? row.valueZar - row.investedZar : null,
  }));
}

function changeOf(h: Holding, tf: Timeframe): number | null {
  return tf === "24h" ? h.change24hPct : tf === "7d" ? h.change7dPct : h.change30dPct;
}

/** P&L as a percentage of cost, or null when there's no cost basis. */
export function pnlPctOf(row: CoinRow): number | null {
  if (row.pnlZar === null || row.investedZar <= 0) return null;
  return (row.pnlZar / row.investedZar) * 100;
}

function nullableCompare(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // unknown always sorts last, either direction
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}

export function sortCoins(rows: CoinRow[], prefs: CoinsPrefs): CoinRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    switch (prefs.sort) {
      case "symbol": {
        const r = a.symbol.localeCompare(b.symbol);
        return prefs.dir === "asc" ? r : -r;
      }
      case "change":
        return nullableCompare(a.change[prefs.timeframe], b.change[prefs.timeframe], prefs.dir);
      case "pnl":
        return nullableCompare(a.pnlZar, b.pnlZar, prefs.dir);
      case "invested":
        return nullableCompare(a.investedZar, b.investedZar, prefs.dir);
      case "holdings":
        return nullableCompare(a.quantity, b.quantity, prefs.dir);
      case "value":
      default:
        return nullableCompare(a.valueZar, b.valueZar, prefs.dir);
    }
  });
  return out;
}

/**
 * A single zar→usd factor derived from any coin priced in both, so the USD
 * view is internally consistent. Null when nothing has both prices.
 */
export function usdFactor(rows: CoinRow[]): number | null {
  for (const r of rows) {
    if (r.priceZar && r.priceUsd && r.priceZar > 0) return r.priceUsd / r.priceZar;
  }
  return null;
}
