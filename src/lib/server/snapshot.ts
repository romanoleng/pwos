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

import { FIELDS, TABLES, assertFields, createRecords } from "./airtable";

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
    [FIELDS.dailyCryptoReport.date]: date,
    [FIELDS.dailyCryptoReport.totalValueZar]: round(totals.valueZar),
    [FIELDS.dailyCryptoReport.totalInvestedZar]: round(totals.investedZar),
    [FIELDS.dailyCryptoReport.pnlZar]: round(totals.pnlZar),
    [FIELDS.dailyCryptoReport.r2mProgressPct]: round(totals.freedomProgressPct, 2),
    [FIELDS.dailyCryptoReport.r3mProgressPct]: round(
      (totals.valueZar / 3_000_000) * 100,
      2,
    ),
    [FIELDS.dailyCryptoReport.milestonesHitCount]: milestoneHits.length,
    [FIELDS.dailyCryptoReport.milestonesHitDetail]: milestoneHits
      .map(
        (h) =>
          `${h.symbol} (${h.wallet}) M${h.lastHitMilestone?.milestone.level}: ${h.lastHitMilestone?.milestone.raw}`,
      )
      .join("\n"),
  };

  if (topGainer) {
    dailyCryptoReport[FIELDS.dailyCryptoReport.topGainer] = topGainer.symbol;
    dailyCryptoReport[FIELDS.dailyCryptoReport.topGainerPct] = round(
      topGainer.change24hPct,
      2,
    );
    dailyCryptoReport[FIELDS.dailyCryptoReport.topGainerPriceZar] = round(
      topGainer.priceZar,
      4,
    );
  }
  if (topLoser) {
    dailyCryptoReport[FIELDS.dailyCryptoReport.topLoser] = topLoser.symbol;
    dailyCryptoReport[FIELDS.dailyCryptoReport.topLoserPct] = round(
      topLoser.change24hPct,
      2,
    );
    dailyCryptoReport[FIELDS.dailyCryptoReport.topLoserPriceZar] = round(
      topLoser.priceZar,
      4,
    );
  }

  const snapshots =
    rate === null
      ? null
      : {
          [FIELDS.snapshots.date]: date,
          [FIELDS.snapshots.totalValueUsd]: round(totals.valueZar / rate),
          [FIELDS.snapshots.totalInvestedUsd]: round(totals.investedZar / rate),
          [FIELDS.snapshots.totalPnlUsd]: round(totals.pnlZar / rate),
          [FIELDS.snapshots.totalReturnPct]: round(totals.pnlPct ?? 0, 2),
          [FIELDS.snapshots.notes]: `Written by PWOS. USD converted at ${rate.toFixed(4)} ZAR/USD (${basis}).`,
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
export async function writeSnapshot(preview: SnapshotPreview): Promise<SnapshotResult> {
  // Fail loudly if the schema moved under us, before writing anything.
  await assertFields(
    TABLES.dailyCryptoReport,
    Object.keys(preview.dailyCryptoReport),
  );
  if (preview.snapshots) {
    await assertFields(TABLES.snapshots, Object.keys(preview.snapshots));
  }

  const [report] = await createRecords(TABLES.dailyCryptoReport, [
    { fields: preview.dailyCryptoReport },
  ]);

  let snapshotId: string | null = null;
  if (preview.snapshots) {
    const [snapshot] = await createRecords(TABLES.snapshots, [
      { fields: preview.snapshots },
    ]);
    snapshotId = snapshot?.id ?? null;
  }

  return { dailyCryptoReportId: report?.id ?? null, snapshotId };
}
