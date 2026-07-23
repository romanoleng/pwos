/**
 * Shapes shared between the server compute layer and the client UI.
 * No server imports — this file is safe to pull into a client component.
 */
import type { Milestone, MilestoneStatus } from "./milestones";

export type PriceSource = "live" | "airtable-fallback" | "none";

export type Holding = {
  recordId: string;
  symbol: string;
  coin: string | null;
  wallet: string;
  quantity: number;

  /** ZAR unit price actually used for valuation. */
  priceZar: number | null;
  priceUsd: number | null;
  priceSource: PriceSource;
  change24hPct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;

  investedZar: number;
  valueZar: number | null;
  pnlZar: number | null;
  pnlPct: number | null;
  /** Share of total portfolio value, 0-100. */
  weightPct: number | null;

  isCore5: boolean;
  category: string | null;

  milestones: Milestone[];
  milestoneStatuses: MilestoneStatus[];
  nextMilestone: MilestoneStatus | null;
  lastHitMilestone: MilestoneStatus | null;
  milestonesHitCount: number;
};

export type WalletGroup = {
  wallet: string;
  holdings: Holding[];
  valueZar: number;
  investedZar: number;
  pnlZar: number;
  pnlPct: number | null;
  weightPct: number;
};

/** A Core 5 coin aggregated across every wallet it sits in. */
export type Core5Position = {
  symbol: string;
  quantity: number;
  priceZar: number | null;
  change24hPct: number | null;
  valueZar: number;
  investedZar: number;
  pnlZar: number;
  pnlPct: number | null;
  /** How many wallets hold it — shown so the aggregate isn't misread. */
  walletCount: number;
};

export type Mover = {
  symbol: string;
  wallet: string;
  change24hPct: number;
  /** Null when CoinGecko's markets call didn't return the longer window. */
  change7dPct: number | null;
  change30dPct: number | null;
  priceZar: number;
  valueZar: number;
};

/** The windows the movers list can be sorted by (live per-coin data only). */
export type MoverWindowKey = "24h" | "7d" | "30d";

export type ChangeWindowKey = "24h" | "7d" | "30d" | "60d" | "90d";

/**
 * The portfolio's move over one window (Romano's ask, 2026-07-23).
 *
 * Two honest bases, never mixed silently:
 * - "live": value-weighted CoinGecko change on current holdings (24h/7d/30d).
 * - "snapshot": change in unrealised P&L versus a stored daily snapshot
 *   (60d/90d — no batched provider endpoint reaches that far back). P&L, not
 *   value, so the monthly DCA deposit can't masquerade as profit; `since`
 *   names the snapshot date the figure is measured against.
 */
export type ChangeWindow = {
  zar: number;
  pct: number;
  basis: "live" | "snapshot";
  /** Snapshot date the window is measured from (snapshot basis only). */
  since?: string;
} | null;

export type PortfolioTotals = {
  valueZar: number;
  investedZar: number;
  pnlZar: number;
  pnlPct: number | null;
  /** Weighted 24h move across holdings that have live prices. */
  change24hPct: number | null;
  change24hZar: number | null;
  /** Every selectable window for the portfolio header. */
  windows: Record<ChangeWindowKey, ChangeWindow>;
  /** Progress toward the R2m freedom number, 0-100 (uncapped above 100). */
  freedomProgressPct: number;
  freedomRemainingZar: number;
};

export type PortfolioMeta = {
  /** Epoch ms when upstream prices were fetched. */
  pricesFetchedAt: number;
  pricesCached: boolean;
  /** Non-null when prices are stale or unavailable — surfaced in the UI. */
  staleReason: string | null;
  /** Symbols with no CoinGecko id, valued from stored Airtable figures. */
  fallbackSymbols: string[];
  /** Symbols with no price at all — excluded from totals. */
  unpricedSymbols: string[];
  /**
   * Coins whose CoinGecko id the app inferred rather than read from Airtable.
   * Surfaced for confirmation: symbols are not unique on CoinGecko, so an
   * inferred match must be checked before it is trusted as a balance.
   */
  inferredIds: {
    symbol: string;
    coingeckoId: string;
    source: "market-data" | "alias" | "inferred";
    name?: string;
    marketCapRank?: number;
  }[];
  holdingsCount: number;
  /** Positions hidden by archiving — still in Airtable. */
  archivedCount: number;
};

export type Portfolio = {
  totals: PortfolioTotals;
  wallets: WalletGroup[];
  core5: Core5Position[];
  gainers: Mover[];
  losers: Mover[];
  /** Every priced coin with its 24h/7d/30d moves — the client sorts per window. */
  movers: Mover[];
  /** Every holding, sorted by value descending. */
  holdings: Holding[];
  /** Holdings whose live price has crossed an un-actioned milestone. */
  milestoneHits: Holding[];
  meta: PortfolioMeta;
};
