/**
 * Search / filter / sort / export for holdings (CLAUDE.md §9b).
 *
 * Pure functions with no React or server imports, so the behaviour that
 * decides which of your positions you're looking at is unit-testable.
 */
import type { Holding } from "./types";

export type SortKey = "value" | "pnlPct" | "change24h" | "weight" | "symbol" | "invested";
export type SortDirection = "asc" | "desc";

export type HoldingFilter = {
  /** Matches symbol or coin name, case-insensitive. */
  query: string;
  wallets: string[];
  core5Only: boolean;
  /** "profit" | "loss" | null */
  performance: "profit" | "loss" | null;
  milestoneHitsOnly: boolean;
};

export const EMPTY_FILTER: HoldingFilter = {
  query: "",
  wallets: [],
  core5Only: false,
  performance: null,
  milestoneHitsOnly: false,
};

export function isFilterActive(filter: HoldingFilter): boolean {
  return (
    filter.query.trim().length > 0 ||
    filter.wallets.length > 0 ||
    filter.core5Only ||
    filter.performance !== null ||
    filter.milestoneHitsOnly
  );
}

export function filterHoldings(
  holdings: Holding[],
  filter: HoldingFilter,
): Holding[] {
  const query = filter.query.trim().toLowerCase();

  return holdings.filter((holding) => {
    if (query) {
      const haystack = `${holding.symbol} ${holding.coin ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filter.wallets.length > 0 && !filter.wallets.includes(holding.wallet)) {
      return false;
    }
    if (filter.core5Only && !holding.isCore5) return false;
    if (filter.milestoneHitsOnly && holding.milestonesHitCount === 0) return false;

    if (filter.performance !== null) {
      // A position with no price has unknown performance — excluded from both
      // sides rather than silently counted as a loss.
      if (holding.pnlZar === null) return false;
      if (filter.performance === "profit" && holding.pnlZar <= 0) return false;
      if (filter.performance === "loss" && holding.pnlZar >= 0) return false;
    }
    return true;
  });
}

/** Nulls always sort last, whichever direction — unknown is not "worst". */
function compareNullable(a: number | null, b: number | null, direction: SortDirection) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

export function sortHoldings(
  holdings: Holding[],
  key: SortKey,
  direction: SortDirection,
): Holding[] {
  const sorted = [...holdings];

  sorted.sort((a, b) => {
    switch (key) {
      case "symbol": {
        const result = a.symbol.localeCompare(b.symbol);
        return direction === "asc" ? result : -result;
      }
      case "pnlPct":
        return compareNullable(a.pnlPct, b.pnlPct, direction);
      case "change24h":
        return compareNullable(a.change24hPct, b.change24hPct, direction);
      case "weight":
        return compareNullable(a.weightPct, b.weightPct, direction);
      case "invested":
        return compareNullable(a.investedZar, b.investedZar, direction);
      case "value":
      default:
        return compareNullable(a.valueZar, b.valueZar, direction);
    }
  });

  return sorted;
}

/** RFC 4180 escaping — a coin note containing a comma must not shift columns. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Exports what's on screen, not the whole table — if you've filtered to
 * losses, you get losses. Numbers are raw so a spreadsheet can compute on
 * them; formatted rand strings would arrive as text.
 */
export function holdingsToCsv(holdings: Holding[]): string {
  const header = [
    "Symbol",
    "Coin",
    "Wallet",
    "Quantity",
    "Price (ZAR)",
    "Price source",
    "Value (ZAR)",
    "Invested (ZAR)",
    "P&L (ZAR)",
    "Return %",
    "24h %",
    "Weight %",
    "Core 5",
    "Milestones hit",
    "Next milestone",
    "Next trigger (ZAR)",
  ];

  const rows = holdings.map((holding) => [
    holding.symbol,
    holding.coin ?? "",
    holding.wallet,
    holding.quantity,
    holding.priceZar ?? "",
    holding.priceSource,
    holding.valueZar ?? "",
    holding.investedZar,
    holding.pnlZar ?? "",
    holding.pnlPct === null ? "" : holding.pnlPct.toFixed(2),
    holding.change24hPct === null ? "" : holding.change24hPct.toFixed(2),
    holding.weightPct === null ? "" : holding.weightPct.toFixed(2),
    holding.isCore5 ? "yes" : "no",
    holding.milestonesHitCount,
    holding.nextMilestone ? `M${holding.nextMilestone.milestone.level}` : "",
    holding.nextMilestone?.milestone.triggerZar ?? "",
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
