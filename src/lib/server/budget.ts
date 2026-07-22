/**
 * Budgets (CLAUDE.md §5).
 *
 * Actuals are aggregated in SQL rather than by pulling every transaction into
 * memory: one round-trip instead of 437 rows over the wire.
 *
 * The consolidated category IS the budget line now, so the mapping table the
 * Airtable version needed has gone.
 */
import "server-only";

import { getBudgetCycle, type BudgetLine, type BudgetSummary } from "@/lib/budget";

import { money, sql } from "./db";

export async function getBudgetSummary(now: Date = new Date()): Promise<BudgetSummary> {
  const cycle = getBudgetCycle(now);

  const [lines, unbudgeted, income] = await Promise.all([
    sql<{ category: string; kind: string | null; budgeted_zar: string; actual_zar: string; txn_count: string }>`
      select b.category, b.kind, b.budgeted_zar,
             coalesce(sum(-t.amount_zar), 0) as actual_zar,
             count(t.id)                     as txn_count
      from budgets b
      left join transactions t
        on t.category = b.category
       and t.type = 'expense'
       and t.occurred_on >= ${cycle.start}::date
       and t.occurred_on <  ${cycle.end}::date
      where b.cycle_start = ${cycle.start}::date
      group by b.id, b.category, b.kind, b.budgeted_zar
      order by actual_zar desc`,

    // Expenses in this cycle whose category has no budget line — real money
    // that must not disappear from the totals.
    sql<{ category: string; amount_zar: string }>`
      select coalesce(t.category, t.original_category, 'Uncategorised') as category,
             sum(-t.amount_zar) as amount_zar
      from transactions t
      where t.type = 'expense'
        and t.occurred_on >= ${cycle.start}::date
        and t.occurred_on <  ${cycle.end}::date
        and not exists (
          select 1 from budgets b
          where b.cycle_start = ${cycle.start}::date and b.category = t.category)
      group by 1
      order by 2 desc`,

    sql<{ total: string }>`
      select coalesce(sum(amount_zar), 0) as total from transactions
      where type = 'income'
        and occurred_on >= ${cycle.start}::date
        and occurred_on <  ${cycle.end}::date`,
  ]);

  const budgetLines: BudgetLine[] = lines.map((r) => {
    const budgetedZar = money(r.budgeted_zar);
    const actualZar = money(r.actual_zar);
    return {
      category: r.category,
      type: r.kind,
      budgetedZar,
      actualZar,
      remainingZar: budgetedZar - actualZar,
      usedPct: budgetedZar > 0 ? (actualZar / budgetedZar) * 100 : 0,
      transactionCount: Number(r.txn_count),
    };
  });

  const budgetedZar = budgetLines.reduce((t, l) => t + l.budgetedZar, 0);
  const actualZar = budgetLines.reduce((t, l) => t + l.actualZar, 0);
  const remainingZar = budgetedZar - actualZar;

  return {
    cycle,
    lines: budgetLines,
    totals: { budgetedZar, actualZar, remainingZar, incomeZar: money(income[0]?.total) },
    unbudgetedZar: unbudgeted.reduce((t, r) => t + money(r.amount_zar), 0),
    unbudgetedCategories: unbudgeted.map((r) => ({
      category: r.category, amountZar: money(r.amount_zar),
    })),
    dailyAllowanceZar: cycle.remainingDays > 0 ? remainingZar / cycle.remainingDays : null,
  };
}
