/**
 * Portfolio value history (CLAUDE.md §5, charts).
 *
 * Reads Daily Crypto Report, not Snapshots. Verified 2026-07-21: Daily Crypto
 * Report holds 34 real rows in ZAR, while Snapshots holds a single row whose
 * value columns are empty and whose notes describe cash transactions. Charting
 * Snapshots would draw an empty axis.
 */
import "server-only";

import { buildHistorySeries, type HistoryPoint, type RawHistoryRow } from "@/lib/crypto/history";

import { FIELDS, TABLES, listRecords, numberCell, stringCell } from "./airtable";

export async function getPortfolioHistory(): Promise<HistoryPoint[]> {
  const records = await listRecords(TABLES.dailyCryptoReport, {
    fieldIds: [
      FIELDS.dailyCryptoReport.date,
      FIELDS.dailyCryptoReport.totalValueZar,
      FIELDS.dailyCryptoReport.totalInvestedZar,
      FIELDS.dailyCryptoReport.pnlZar,
      FIELDS.dailyCryptoReport.r2mProgressPct,
    ],
  });

  const rows: RawHistoryRow[] = records.map((record) => ({
    date: stringCell(record, FIELDS.dailyCryptoReport.date),
    createdTime: record.createdTime,
    valueZar: numberCell(record, FIELDS.dailyCryptoReport.totalValueZar),
    investedZar: numberCell(record, FIELDS.dailyCryptoReport.totalInvestedZar),
    pnlZar: numberCell(record, FIELDS.dailyCryptoReport.pnlZar),
    progressPct: numberCell(record, FIELDS.dailyCryptoReport.r2mProgressPct),
  }));

  return buildHistorySeries(rows);
}
