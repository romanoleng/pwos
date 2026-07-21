/**
 * Reports (CLAUDE.md §5) — a basic monthly summary in V1.
 *
 * Built entirely from the typed ledger, so transfers and contributions are
 * separated from real spending rather than lumped together.
 */
import "server-only";

import { getBudgetCycle } from "@/lib/budget";
import { spendContribution } from "@/lib/transactions";

import { getTransactions } from "./transactions";

export type MonthReport = {
  month: string;
  incomeZar: number;
  spendZar: number;
  transferZar: number;
  contributionZar: number;
  netZar: number;
  transactionCount: number;
  topCategories: { category: string; amountZar: number }[];
};

export type ReportsSummary = {
  months: MonthReport[];
  currentCycle: { start: string; end: string; spendZar: number; incomeZar: number };
};

export async function getReports(): Promise<ReportsSummary> {
  const transactions = await getTransactions();
  const cycle = getBudgetCycle();

  const byMonth = new Map<string, MonthReport & { categories: Map<string, number> }>();

  for (const txn of transactions) {
    if (!txn.date) continue;
    const month = txn.date.slice(0, 7);
    const entry =
      byMonth.get(month) ??
      {
        month,
        incomeZar: 0,
        spendZar: 0,
        transferZar: 0,
        contributionZar: 0,
        netZar: 0,
        transactionCount: 0,
        topCategories: [],
        categories: new Map<string, number>(),
      };

    entry.transactionCount += 1;

    if (txn.type === "income") entry.incomeZar += txn.amountZar;
    else if (txn.type === "transfer") entry.transferZar += Math.abs(txn.amountZar);
    else if (txn.type === "contribution") entry.contributionZar += Math.abs(txn.amountZar);
    else {
      const spend = spendContribution(txn.amountZar, txn.category, txn.description);
      entry.spendZar += spend;
      if (txn.category) {
        entry.categories.set(txn.category, (entry.categories.get(txn.category) ?? 0) + spend);
      }
    }

    byMonth.set(month, entry);
  }

  const months = [...byMonth.values()]
    .map((entry) => ({
      month: entry.month,
      incomeZar: entry.incomeZar,
      spendZar: entry.spendZar,
      transferZar: entry.transferZar,
      contributionZar: entry.contributionZar,
      netZar: entry.incomeZar - entry.spendZar,
      transactionCount: entry.transactionCount,
      topCategories: [...entry.categories.entries()]
        .map(([category, amountZar]) => ({ category, amountZar }))
        .sort((a, b) => b.amountZar - a.amountZar)
        .slice(0, 5),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  const inCycle = transactions.filter(
    (t) => t.date && t.date >= cycle.start && t.date < cycle.end,
  );

  return {
    months,
    currentCycle: {
      start: cycle.start,
      end: cycle.end,
      spendZar: inCycle
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + spendContribution(t.amountZar, t.category, t.description), 0),
      incomeZar: inCycle
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amountZar, 0),
    },
  };
}
