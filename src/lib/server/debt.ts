/**
 * Debt module (CLAUDE.md §3, §5). Debt Tracker is the single source; the
 * Net Worth liability rows are a derived rollup, reported here only so the
 * disagreement between the two is visible rather than hidden.
 */
import "server-only";

import { FIELDS, TABLES } from "@/lib/airtable-fields";
import { findDuplicates, type DebtRow, type DebtSummary } from "@/lib/debt";

import { listRecords, numberCell, stringCell } from "./airtable";

const DEBT_FIELDS = [
  FIELDS.debt.name,
  FIELDS.debt.type,
  FIELDS.debt.balanceZar,
  FIELDS.debt.monthlyZar,
  FIELDS.debt.interestPct,
  FIELDS.debt.priority,
  FIELDS.debt.status,
  FIELDS.debt.payoffDate,
] as const;

export async function getDebtSummary(): Promise<DebtSummary> {
  const [debtRecords, netWorthRecords] = await Promise.all([
    listRecords(TABLES.debtTracker, { fieldIds: DEBT_FIELDS }),
    listRecords(TABLES.netWorth, {
      fieldIds: [FIELDS.netWorth.name, FIELDS.netWorth.type, FIELDS.netWorth.valueZar],
    }),
  ]);

  const rows: DebtRow[] = debtRecords.map((record) => ({
    recordId: record.id,
    name: stringCell(record, FIELDS.debt.name) ?? "—",
    type: stringCell(record, FIELDS.debt.type),
    balanceZar: numberCell(record, FIELDS.debt.balanceZar) ?? 0,
    monthlyZar: numberCell(record, FIELDS.debt.monthlyZar) ?? 0,
    interestPct: numberCell(record, FIELDS.debt.interestPct),
    priority: stringCell(record, FIELDS.debt.priority),
    status: stringCell(record, FIELDS.debt.status),
    payoffDate: stringCell(record, FIELDS.debt.payoffDate),
  }));

  const netWorthLiabilitiesZar = netWorthRecords
    .filter((record) => stringCell(record, FIELDS.netWorth.type) === "Liability")
    .reduce((total, record) => total + (numberCell(record, FIELDS.netWorth.valueZar) ?? 0), 0);

  const duplicates = findDuplicates(rows);
  const totalZar = rows.reduce((total, row) => total + row.balanceZar, 0);
  const overcount = duplicates.reduce(
    (total, group) => total + (group.countedZar - group.dedupedZar),
    0,
  );

  return {
    rows: rows.sort((a, b) => b.balanceZar - a.balanceZar),
    totalZar,
    dedupedTotalZar: totalZar - overcount,
    monthlyZar: rows.reduce((total, row) => total + row.monthlyZar, 0),
    duplicates,
    netWorthLiabilitiesZar,
    discrepancyZar: totalZar - netWorthLiabilitiesZar,
  };
}
