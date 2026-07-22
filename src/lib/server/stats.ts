/**
 * Stats — income and spending, side by side (build report, "Stats" screen).
 *
 * The rest of the app answers "what did I just do" and "am I within budget".
 * This answers "what is actually happening": where money comes from, where it
 * goes, and whether either is moving.
 *
 * Income is the half with no home anywhere else. Romano is paid by clients,
 * not a payroll, so "is this month normal?" is a real question — and one no
 * other screen can answer.
 *
 * Everything is aggregated in SQL. Pulling 438 rows over the wire to group
 * them in JavaScript would work today and stop working quietly later.
 */
import "server-only";

import { resolvePeriod, type PeriodKind } from "@/lib/period";
import { toLocalISODate } from "@/lib/crypto/history";

import { getCycleBounds } from "./cycle";
import { cutoverFloor } from "./cutover";
import { money, sql } from "./db";

export type StatSlice = {
  label: string;
  amountZar: number;
  sharePct: number;
  count: number;
};

export type MonthPoint = {
  month: string;
  incomeZar: number;
  expenseZar: number;
};

export type StatsSummary = {
  period: { kind: PeriodKind; label: string; start: string | null; end: string };
  income: {
    totalZar: number;
    count: number;
    byCategory: StatSlice[];
    /** Who actually paid — descriptions collapsed, since clients repeat. */
    bySource: StatSlice[];
  };
  expense: {
    totalZar: number;
    count: number;
    byCategory: StatSlice[];
    byAccount: StatSlice[];
  };
  /** Net for the period: what came in, less what went out. */
  netZar: number;
  /** Twelve months of both, oldest first, for the trend. */
  months: MonthPoint[];
  /** The same period one step back, so the headline can be compared. */
  previous: { label: string; incomeZar: number; expenseZar: number } | null;
};

function slices(
  rows: { label: string | null; amount: string; n: string }[],
): StatSlice[] {
  const total = rows.reduce((sum, r) => sum + money(r.amount), 0);
  return rows
    .map((r) => ({
      label: r.label ?? "Uncategorised",
      amountZar: money(r.amount),
      sharePct: total > 0 ? (money(r.amount) / total) * 100 : 0,
      count: Number(r.n),
    }))
    .filter((slice) => slice.amountZar > 0);
}

export async function getStats(periodKind: PeriodKind = "cycle"): Promise<StatsSummary> {
  const today = toLocalISODate(new Date());
  const bounds = await getCycleBounds();
  const period = resolvePeriod(periodKind, today, bounds);
  const floor = await cutoverFloor();

  // A null start means "everything", so the lower bound is left open rather
  // than faked with an early date that would silently exclude older rows.
  // The later of the selected period and the cutover — a period that reaches
  // back past the reset must still stop at it.
  const start =
    floor === null ? period.start
    : period.start === null ? floor
    : period.start > floor ? period.start : floor;
  const end = period.end;

  const [
    incomeByCategory, incomeBySource, expenseByCategory, expenseByAccount,
    totals, months, previous,
  ] = await Promise.all([
    sql<{ label: string | null; amount: string; n: string }>`
      select category as label, sum(amount_zar) as amount, count(*)::text as n
      from transactions
      where type = 'income' and occurred_on < ${end}::date
        and (${start}::date is null or occurred_on >= ${start}::date)
      group by 1 order by 2 desc`,

    sql<{ label: string | null; amount: string; n: string }>`
      select
        -- Bank descriptions vary ("Payment Received: Creativedigital",
        -- "Acb Credit Creativedigital"). Collapsing on the distinctive word
        -- keeps one payer as one row.
        case
          when description ilike '%creativedigital%' then 'CreativeDigital'
          when description ilike '%client payment%'  then 'Client payment'
          else initcap(trim(description))
        end as label,
        sum(amount_zar) as amount, count(*)::text as n
      from transactions
      where type = 'income' and occurred_on < ${end}::date
        and (${start}::date is null or occurred_on >= ${start}::date)
      group by 1 order by 2 desc limit 12`,

    sql<{ label: string | null; amount: string; n: string }>`
      select coalesce(category, original_category) as label,
             sum(-amount_zar) as amount, count(*)::text as n
      from transactions
      where type = 'expense' and occurred_on < ${end}::date
        and (${start}::date is null or occurred_on >= ${start}::date)
      group by 1 order by 2 desc`,

    sql<{ label: string | null; amount: string; n: string }>`
      select a.label as label, sum(-t.amount_zar) as amount, count(*)::text as n
      from transactions t
      left join accounts a on a.id = t.account_id
      where t.type = 'expense' and t.occurred_on < ${end}::date
        and (${start}::date is null or t.occurred_on >= ${start}::date)
      group by 1 order by 2 desc`,

    sql<{ income: string; expense: string; in_n: string; out_n: string }>`
      select
        coalesce(sum(amount_zar)  filter (where type = 'income'), 0)  as income,
        coalesce(sum(-amount_zar) filter (where type = 'expense'), 0) as expense,
        count(*) filter (where type = 'income')::text                 as in_n,
        count(*) filter (where type = 'expense')::text                as out_n
      from transactions
      where occurred_on < ${end}::date
        and (${start}::date is null or occurred_on >= ${start}::date)`,

    // Always twelve months regardless of the selected period: a trend is only
    // a trend if the window is longer than the thing being measured.
    sql<{ month: string; income: string; expense: string }>`
      select to_char(occurred_on, 'YYYY-MM') as month,
             coalesce(sum(amount_zar)  filter (where type = 'income'), 0)  as income,
             coalesce(sum(-amount_zar) filter (where type = 'expense'), 0) as expense
      from transactions
      where occurred_on >= (date_trunc('month', ${today}::date) - interval '11 months')
        and (${floor}::date is null or occurred_on >= ${floor}::date)
      group by 1 order by 1`,

    // The cycle before this one, for the "compared with" line.
    sql<{ income: string; expense: string }>`
      select
        coalesce(sum(amount_zar)  filter (where type = 'income'), 0)  as income,
        coalesce(sum(-amount_zar) filter (where type = 'expense'), 0) as expense
      from transactions
      where ${floor}::date is null and ${bounds.previousStart}::date is not null
        and occurred_on >= ${bounds.previousStart}::date
        and occurred_on <  ${bounds.start}::date`,
  ]);

  const incomeZar = money(totals[0]?.income);
  const expenseZar = money(totals[0]?.expense);

  return {
    period: { kind: period.kind, label: period.label, start: period.start, end: period.end },
    income: {
      totalZar: incomeZar,
      count: Number(totals[0]?.in_n ?? 0),
      byCategory: slices(incomeByCategory),
      bySource: slices(incomeBySource),
    },
    expense: {
      totalZar: expenseZar,
      count: Number(totals[0]?.out_n ?? 0),
      byCategory: slices(expenseByCategory),
      byAccount: slices(expenseByAccount),
    },
    netZar: incomeZar - expenseZar,
    months: months.map((m) => ({
      month: m.month,
      incomeZar: money(m.income),
      expenseZar: money(m.expense),
    })),
    previous:
      bounds.previousStart === null
        ? null
        : {
            label: "previous cycle",
            incomeZar: money(previous[0]?.income),
            expenseZar: money(previous[0]?.expense),
          },
  };
}
