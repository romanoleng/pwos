/**
 * Reports (CLAUDE.md §5).
 * Aggregated in SQL — the month grouping the Airtable version did in memory.
 */
import "server-only";

import { getBudgetCycle } from "@/lib/budget";

import { money, sql } from "./db";

export type MonthReport = {
  month: string; incomeZar: number; spendZar: number; transferZar: number;
  contributionZar: number; netZar: number; transactionCount: number;
  topCategories: { category: string; amountZar: number }[];
};

export type ReportsSummary = {
  months: MonthReport[];
  currentCycle: { start: string; end: string; spendZar: number; incomeZar: number };
};

export async function getReports(): Promise<ReportsSummary> {
  const cycle = getBudgetCycle();

  const [months, categories, current] = await Promise.all([
    sql<{ month: string; income: string; spend: string; transfer: string; contribution: string; n: string }>`
      select to_char(occurred_on, 'YYYY-MM')                                   as month,
             coalesce(sum(amount_zar) filter (where type='income'), 0)         as income,
             coalesce(sum(-amount_zar) filter (where type='expense'), 0)       as spend,
             coalesce(sum(abs(amount_zar)) filter (where type='transfer'), 0)  as transfer,
             coalesce(sum(abs(amount_zar)) filter (where type='contribution'), 0) as contribution,
             count(*)::text                                                    as n
      from transactions group by 1 order by 1 desc`,
    sql<{ month: string; category: string; amount: string }>`
      select to_char(occurred_on,'YYYY-MM') as month,
             coalesce(category, original_category, 'Uncategorised') as category,
             sum(-amount_zar) as amount
      from transactions where type='expense'
      group by 1,2 order by 1 desc, 3 desc`,
    sql<{ spend: string; income: string }>`
      select coalesce(sum(-amount_zar) filter (where type='expense'), 0) as spend,
             coalesce(sum(amount_zar)  filter (where type='income'), 0)  as income
      from transactions
      where occurred_on >= ${cycle.start}::date and occurred_on < ${cycle.end}::date`,
  ]);

  const byMonth = new Map<string, { category: string; amountZar: number }[]>();
  for (const c of categories) {
    const list = byMonth.get(c.month) ?? [];
    if (list.length < 5) list.push({ category: c.category, amountZar: money(c.amount) });
    byMonth.set(c.month, list);
  }

  return {
    months: months.map((m) => ({
      month: m.month,
      incomeZar: money(m.income),
      spendZar: money(m.spend),
      transferZar: money(m.transfer),
      contributionZar: money(m.contribution),
      netZar: money(m.income) - money(m.spend),
      transactionCount: Number(m.n),
      topCategories: byMonth.get(m.month) ?? [],
    })),
    currentCycle: {
      start: cycle.start, end: cycle.end,
      spendZar: money(current[0]?.spend), incomeZar: money(current[0]?.income),
    },
  };
}
