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

import type { BudgetLine, BudgetSummary } from "@/lib/budget";

import { cutoverFloor } from "./cutover";
import { getCurrentCycle } from "./cycle";

import { money, sql } from "./db";

/**
 * What a fresh cycle would look like under each starting option.
 *
 * Only computed when the cycle is empty, and shown before either button is
 * pressed: seeding from actuals is only as honest as the logging behind it, so
 * the two totals need to be visible side by side rather than discovered after.
 */
async function previewCycleStart(cycleStart: string): Promise<BudgetSummary["cycleStart"]> {
  // Pre-reset cycles aren't offered: after a reset there is nothing to copy.
  const floor = await cutoverFloor();
  const previous = await sql<{ cycle_start: string }>`
    select cycle_start::text from budgets where cycle_start < ${cycleStart}::date
      and (${floor}::date is null or cycle_start >= ${floor}::date)
    order by cycle_start desc limit 1`;
  if (previous.length === 0) return null;
  const from = previous[0].cycle_start;

  const [[copy], [seed]] = await Promise.all([
    sql<{ n: string; t: string }>`
      select count(*)::text n, coalesce(sum(b.budgeted_zar), 0)::text t
      from budgets b join categories c on c.name = b.category and c.kind = 'expense'
      where b.cycle_start = ${from}::date`,
    sql<{ n: string; t: string }>`
      with spend as (
        select t.category, sum(-t.amount_zar) as actual_zar from transactions t
        join categories c on c.name = t.category and c.kind = 'expense'
        where t.type = 'expense' and t.occurred_on >= ${from}::date
          and t.occurred_on < ${cycleStart}::date
        group by t.category having sum(-t.amount_zar) > 0
      ),
      prior as (
        select b.category, b.budgeted_zar from budgets b
        join categories c on c.name = b.category and c.kind = 'expense'
        where b.cycle_start = ${from}::date
      )
      select count(*)::text n,
             coalesce(sum(round(coalesce(spend.actual_zar, prior.budgeted_zar) / 10) * 10), 0)::text t
      from spend full outer join prior on prior.category = spend.category`,
  ]);

  return {
    from,
    copyLines: Number(copy.n), copyTotalZar: money(copy.t),
    seedLines: Number(seed.n), seedTotalZar: money(seed.t),
  };
}

/**
 * The titles that a blank restore would bring back. Counts across the cutover
 * on purpose: titles are structure, not history — only the amounts were reset.
 */
async function previewBlankStart(
  cycleStart: string,
): Promise<{ titles: number; from: string } | null> {
  const previous = await sql<{ cycle_start: string; n: string }>`
    select b.cycle_start::text, count(*)::text as n
    from budgets b
    join categories c on c.name = b.category and c.kind = 'expense' and not c.archived
    where b.cycle_start < ${cycleStart}::date
    group by b.cycle_start
    order by b.cycle_start desc limit 1`;
  if (previous.length === 0) return null;
  return { titles: Number(previous[0].n), from: previous[0].cycle_start };
}

export async function getBudgetSummary(now: Date = new Date()): Promise<BudgetSummary> {
  const cycle = await getCurrentCycle(now);
  const floor = await cutoverFloor();

  const [lines, contributionLines, spareContributions, unbudgeted, income, spare, plan, puttingAway] = await Promise.all([
    sql<{ id: string; category: string; kind: string | null; budgeted_zar: string; actual_zar: string; txn_count: string }>`
      select b.id::text, b.category, b.kind, b.budgeted_zar,
             coalesce(sum(-t.amount_zar), 0) as actual_zar,
             count(t.id)                     as txn_count
      from budgets b
      join categories c on c.name = b.category
      left join transactions t
        on t.category = b.category
       and t.type = 'expense'
       and t.occurred_on >= ${cycle.start}::date
       and t.occurred_on <  ${cycle.end}::date
       and (${floor}::date is null or t.occurred_on >= ${floor}::date)
      where b.cycle_start = ${cycle.start}::date and c.kind = 'expense'
        and (${floor}::date is null or b.cycle_start >= ${floor}::date)
      group by b.id, b.category, b.kind, b.budgeted_zar
      order by actual_zar desc`,

    // "Putting away" lines — the planned monthly contributions (crypto,
    // savings). Same shape as expense lines but their actuals come from
    // contribution transactions, so a set-aside can be planned like a bill.
    sql<{ id: string; category: string; kind: string | null; budgeted_zar: string; actual_zar: string; txn_count: string }>`
      select b.id::text, b.category, b.kind, b.budgeted_zar,
             coalesce(sum(-t.amount_zar), 0) as actual_zar,
             count(t.id)                     as txn_count
      from budgets b
      join categories c on c.name = b.category
      left join transactions t
        on t.category = b.category
       and t.type = 'contribution'
       and t.occurred_on >= ${cycle.start}::date
       and t.occurred_on <  ${cycle.end}::date
       and (${floor}::date is null or t.occurred_on >= ${floor}::date)
      where b.cycle_start = ${cycle.start}::date and c.kind = 'contribution'
        and (${floor}::date is null or b.cycle_start >= ${floor}::date)
      group by b.id, b.category, b.kind, b.budgeted_zar
      order by actual_zar desc`,

    // Contribution categories with no put-away line yet — the add picker.
    sql<{ name: string; kind: string }>`
      select c.name, c.kind::text from categories c
      where c.kind = 'contribution' and not c.archived
        and not exists (
        select 1 from budgets b
        where b.cycle_start = ${cycle.start}::date and b.category = c.name)
      order by c.sort_order, c.name`,

    // Expenses in this cycle whose category has no budget line — real money
    // that must not disappear from the totals.
    sql<{ category: string; amount_zar: string }>`
      select coalesce(t.category, t.original_category, 'Uncategorised') as category,
             sum(-t.amount_zar) as amount_zar
      from transactions t
      where t.type = 'expense'
        and t.occurred_on >= ${cycle.start}::date
        and t.occurred_on <  ${cycle.end}::date
        and (${floor}::date is null or t.occurred_on >= ${floor}::date)
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

    // Categories with no line yet — what the "add" picker can still offer.
    sql<{ name: string; kind: string }>`
      select c.name, c.kind::text from categories c
      where c.kind = 'expense'
        and not exists (
        select 1 from budgets b
        where b.cycle_start = ${cycle.start}::date and b.category = c.name)
      order by c.kind, c.sort_order, c.name`,

    sql<{ expected_income_zar: string }>`
      select expected_income_zar from cycle_plans where cycle_start = ${cycle.start}::date`,

    // Contributions left the budget, but they still lay claim to the income,
    // so leaving them out would overstate what's free.
    sql<{ total: string }>`
      select coalesce(sum(b.budgeted_zar), 0) as total from budgets b
      join categories c on c.name = b.category and c.kind = 'contribution'
      where b.cycle_start = ${cycle.start}::date
        and (${floor}::date is null or b.cycle_start >= ${floor}::date)`,
  ]);

  const budgetLines: BudgetLine[] = lines.map((r) => {
    const budgetedZar = money(r.budgeted_zar);
    const actualZar = money(r.actual_zar);
    return {
      recordId: r.id,
      category: r.category,
      type: r.kind,
      budgetedZar,
      actualZar,
      remainingZar: budgetedZar - actualZar,
      usedPct: budgetedZar > 0 ? (actualZar / budgetedZar) * 100 : 0,
      transactionCount: Number(r.txn_count),
    };
  });

  const contributions: BudgetLine[] = contributionLines.map((r) => {
    const budgetedZar = money(r.budgeted_zar);
    const actualZar = money(r.actual_zar);
    return {
      recordId: r.id,
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
    contributions,
    availableContributions: spareContributions,
    totals: { budgetedZar, actualZar, remainingZar, incomeZar: money(income[0]?.total) },
    unbudgetedZar: unbudgeted.reduce((t, r) => t + money(r.amount_zar), 0),
    unbudgetedCategories: unbudgeted.map((r) => ({
      category: r.category, amountZar: money(r.amount_zar),
    })),
    dailyAllowanceZar: cycle.remainingDays > 0 ? remainingZar / cycle.remainingDays : null,
    availableCategories: spare,
    plan: (() => {
      const receivedIncomeZar = money(income[0]?.total);
      // No plan set yet: fall back to what has actually arrived, so the figures
      // mean something on day one rather than reading as a R0 income.
      const expectedIncomeZar = plan.length > 0
        ? money(plan[0].expected_income_zar)
        : receivedIncomeZar;
      const puttingAwayZar = money(puttingAway[0]?.total);
      return {
        expectedIncomeZar,
        receivedIncomeZar,
        allocatedZar: budgetedZar,
        puttingAwayZar,
        unallocatedZar: expectedIncomeZar - budgetedZar - puttingAwayZar,
      };
    })(),
    cycleStart: budgetLines.length === 0 ? await previewCycleStart(cycle.start) : null,
    blankStart: budgetLines.length === 0 ? await previewBlankStart(cycle.start) : null,
  };
}
