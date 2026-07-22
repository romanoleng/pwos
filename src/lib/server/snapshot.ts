/**
 * Daily snapshot write-back (CLAUDE.md §5).
 *
 * Additive only — this creates rows, and there is no update or delete path.
 * Every write is preceded by a preview the user must approve in the UI, and by
 * an assertFields check against the live Metadata API schema (§3).
 */
import "server-only";

import { toLocalISODate } from "@/lib/crypto/history";
import type { Portfolio } from "@/lib/crypto/types";

import { sql } from "./db";

export type SnapshotPreview = {
  /** ISO date in Africa/Johannesburg — the key both tables are stamped with. */
  date: string;
  /** Derived ZAR→USD rate, and how it was obtained. */
  usdRate: number | null;
  usdRateBasis: string;
  dailyCryptoReport: Record<string, unknown>;
  snapshots: Record<string, unknown> | null;
  /** Anything the user should know before approving. */
  warnings: string[];
};

/**
 * Snapshots is USD-denominated but the portfolio is computed in ZAR, so a rate
 * is needed. Rather than a separate FX call, derive it from coins we already
 * priced in both currencies and take the median — a single coin could be
 * mid-update on CoinGecko, but the median across dozens cannot be.
 */
function deriveUsdRate(portfolio: Portfolio): { rate: number | null; basis: string } {
  const rates = portfolio.holdings
    .filter((h) => h.priceSource === "live" && h.priceZar && h.priceUsd)
    .map((h) => h.priceZar! / h.priceUsd!)
    .filter((rate) => Number.isFinite(rate) && rate > 0)
    .sort((a, b) => a - b);

  if (rates.length === 0) {
    return { rate: null, basis: "no live dual-currency prices available" };
  }

  const median = rates[Math.floor(rates.length / 2)];
  return {
    rate: median,
    basis: `median of ${rates.length} live ZAR/USD pairs`,
  };
}

export function buildSnapshotPreview(
  portfolio: Portfolio,
  now: Date = new Date(),
): SnapshotPreview {
  const date = toLocalISODate(now);
  const { totals, meta } = portfolio;
  const { rate, basis } = deriveUsdRate(portfolio);

  const warnings: string[] = [];
  if (meta.staleReason) {
    warnings.push(
      `Prices are stale (${meta.staleReason}). The snapshot would record cached figures.`,
    );
  }
  if (meta.fallbackSymbols.length > 0) {
    warnings.push(
      `${meta.fallbackSymbols.length} coin(s) valued from stored Airtable prices, not live: ${meta.fallbackSymbols.join(", ")}.`,
    );
  }
  if (meta.unpricedSymbols.length > 0) {
    warnings.push(
      `${meta.unpricedSymbols.length} coin(s) have no price and are excluded from totals: ${meta.unpricedSymbols.join(", ")}.`,
    );
  }
  if (rate === null) {
    warnings.push("No USD rate could be derived, so the Snapshots row is skipped.");
  }

  const milestoneHits = portfolio.milestoneHits;
  const topGainer = portfolio.gainers[0] ?? null;
  const topLoser = portfolio.losers[0] ?? null;

  const dailyCryptoReport: Record<string, unknown> = {
    snapshot_on: date,
    value_zar: round(totals.valueZar),
    invested_zar: round(totals.investedZar),
    pnl_zar: round(totals.pnlZar),
    freedom_pct: round(totals.freedomProgressPct, 2),
    milestones_hit: milestoneHits.length,
    milestones_detail: milestoneHits
      .map((h) => `${h.symbol} (${h.wallet}) M${h.lastHitMilestone?.milestone.level}: ${h.lastHitMilestone?.milestone.raw}`)
      .join("\n"),
  };

  if (topGainer) {
    dailyCryptoReport.top_gainer = topGainer.symbol;
    dailyCryptoReport.top_gainer_pct = round(topGainer.change24hPct, 2);
  }
  if (topLoser) {
    dailyCryptoReport.top_loser = topLoser.symbol;
    dailyCryptoReport.top_loser_pct = round(topLoser.change24hPct, 2);
  }

  const snapshots = rate === null ? null : {
    usd_rate: round(rate, 4),
    value_usd: round(totals.valueZar / rate),
    invested_usd: round(totals.investedZar / rate),
  };

  return { date, usdRate: rate, usdRateBasis: basis, dailyCryptoReport, snapshots, warnings };
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type SnapshotResult = {
  dailyCryptoReportId: string | null;
  snapshotId: string | null;
};

/**
 * Performs the write. Callers must have shown the preview and taken an explicit
 * confirmation first — see SnapshotButton.
 */
/**
 * Writes the snapshot. Callers must have shown the preview and taken an
 * explicit confirmation first — see SnapshotButton.
 *
 * One row per day: re-running replaces rather than duplicating.
 */
export async function writeSnapshot(preview: SnapshotPreview): Promise<SnapshotResult> {
  const d = preview.dailyCryptoReport as Record<string, number | string>;
  await sql`
    insert into portfolio_snapshots
      (snapshot_on, value_zar, invested_zar, pnl_zar, freedom_pct, milestones_hit, detail)
    values (${preview.date}::date, ${d.value_zar}, ${d.invested_zar}, ${d.pnl_zar},
            ${d.freedom_pct}, ${d.milestones_hit},
            ${JSON.stringify({ ...d, usd: preview.snapshots })}::jsonb)
    on conflict (snapshot_on) do update set
      value_zar = excluded.value_zar, invested_zar = excluded.invested_zar,
      pnl_zar = excluded.pnl_zar, freedom_pct = excluded.freedom_pct,
      milestones_hit = excluded.milestones_hit, detail = excluded.detail`;

  return { dailyCryptoReportId: preview.date, snapshotId: preview.date };
}
