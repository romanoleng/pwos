/**
 * Budgets (CLAUDE.md §5).
 *
 * Actuals are computed from the transaction ledger, NOT from the Budget
 * table's stored `Actual` column — that column is R0 for 15 of 16 categories,
 * so trusting it would show a budget that looks perfectly on track while the
 * money is gone.
 *
 * Only `expense` transactions count. Transfers and contributions are excluded
 * by §3, which is why the Type backfill mattered: R149k of transfers would
 * otherwise land in these figures.
 */
import "server-only";

import { FIELDS, TABLES } from "@/lib/airtable-fields";
import { getBudgetCycle, isInCycle, type BudgetLine, type BudgetSummary } from "@/lib/budget";
import { spendContribution } from "@/lib/transactions";

import { listRecords, numberCell, stringCell } from "./airtable";
import { getTransactions } from "./transactions";

const BUDGET_FIELDS = [
  FIELDS.budget.category,
  FIELDS.budget.type,
  FIELDS.budget.budgetedZar,
  FIELDS.budget.actualZar,
  FIELDS.budget.month,
] as const;

export async function getBudgetSummary(now: Date = new Date()): Promise<BudgetSummary> {
  const cycle = getBudgetCycle(now);

  const [budgetRows, transactions] = await Promise.all([
    listRecords(TABLES.budget, { fieldIds: BUDGET_FIELDS }),
    getTransactions(),
  ]);

  const forThisCycle = budgetRows.filter((row) => {
    const month = stringCell(row, FIELDS.budget.month);
    return month ? month.slice(0, 7) === cycle.budgetMonth.slice(0, 7) : false;
  });

  // Spend per consolidated budget category, this cycle, expenses only.
  const spendByCategory = new Map<string, { amount: number; count: number }>();
  const unbudgeted = new Map<string, number>();

  for (const txn of transactions) {
    if (txn.type !== "expense") continue;
    if (!isInCycle(txn.date, cycle)) continue;

    // Genuine refunds reduce spend; mis-signed expenses still add to it.
    const spend = spendContribution(txn.amountZar, txn.category, txn.description);
    const line = txn.budgetCategory;

    if (!line) {
      if (txn.category) {
        unbudgeted.set(txn.category, (unbudgeted.get(txn.category) ?? 0) + spend);
      }
      continue;
    }

    const current = spendByCategory.get(line) ?? { amount: 0, count: 0 };
    spendByCategory.set(line, { amount: current.amount + spend, count: current.count + 1 });
  }

  const lines: BudgetLine[] = forThisCycle.map((row) => {
    const category = stringCell(row, FIELDS.budget.category) ?? "—";
    const budgetedZar = numberCell(row, FIELDS.budget.budgetedZar) ?? 0;
    const spent = spendByCategory.get(category) ?? { amount: 0, count: 0 };
    return {
      category,
      type: stringCell(row, FIELDS.budget.type),
      budgetedZar,
      actualZar: spent.amount,
      remainingZar: budgetedZar - spent.amount,
      usedPct: budgetedZar > 0 ? (spent.amount / budgetedZar) * 100 : 0,
      transactionCount: spent.count,
    };
  });

  // Spend against a budget line that doesn't exist this cycle must still show,
  // otherwise real money would vanish from the totals entirely.
  for (const [category, spent] of spendByCategory) {
    if (!lines.some((line) => line.category === category)) {
      unbudgeted.set(category, (unbudgeted.get(category) ?? 0) + spent.amount);
    }
  }

  const budgetedZar = lines.reduce((total, line) => total + line.budgetedZar, 0);
  const actualZar = lines.reduce((total, line) => total + line.actualZar, 0);
  const unbudgetedZar = [...unbudgeted.values()].reduce((total, amount) => total + amount, 0);

  const incomeZar = transactions
    .filter((txn) => txn.type === "income" && isInCycle(txn.date, cycle))
    .reduce((total, txn) => total + txn.amountZar, 0);

  const remainingZar = budgetedZar - actualZar;

  return {
    cycle,
    lines: lines.sort((a, b) => b.actualZar - a.actualZar),
    totals: { budgetedZar, actualZar, remainingZar, incomeZar },
    unbudgetedZar,
    unbudgetedCategories: [...unbudgeted.entries()]
      .map(([category, amountZar]) => ({ category, amountZar }))
      .sort((a, b) => b.amountZar - a.amountZar),
    dailyAllowanceZar:
      cycle.remainingDays > 0 ? remainingZar / cycle.remainingDays : null,
  };
}
