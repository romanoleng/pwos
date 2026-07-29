/**
 * Data check (Romano's ask, 2026-07-29 — "cross check all things logged and
 * fields").
 *
 * This can't run from a dev machine: the live data lives in Neon and only the
 * deployment holds DATABASE_URL. So the audit itself is a server module that
 * runs on Vercel, where the DB is reachable, and the page renders whatever it
 * finds. It answers the one question the budget screen can't: "I logged this —
 * why isn't it where I expect?"
 *
 * The rule it checks against is the exact one budgets use (see budget.ts): an
 * expense counts toward a line only when its category text EXACTLY matches a
 * line's category, its type is 'expense', and its date is inside the current
 * cycle and on/after the fresh-start cutover. Every "why not" below is one of
 * those conditions failing.
 */
import "server-only";

import { money, sql } from "./db";
import { cutoverFloor } from "./cutover";
import { getCurrentCycle } from "./cycle";

export type LogCheckStatus =
  | "ok"
  | "unbudgeted"
  | "uncategorised"
  | "other-cycle"
  | "not-spend"
  | "hidden";

export type LogCheck = {
  recordId: string;
  date: string;
  description: string;
  amountZar: number;
  type: string;
  category: string | null;
  subcategory: string | null;
  accountLabel: string | null;
  status: LogCheckStatus;
  reason: string;
};

export type DataCheck = {
  cycle: { start: string; end: string; floor: string | null };
  counts: { expense: number; income: number; transfer: number; contribution: number };
  recent: LogCheck[];
  issues: {
    /** Expenses in-cycle whose category has no budget line — the petrol case. */
    unbudgeted: { category: string; amountZar: number; count: number }[];
    /** Categories used this cycle that don't exist in the categories table. */
    unknownCategories: { category: string; count: number }[];
    /** Expenses in-cycle with no category at all. */
    uncategorisedZar: number;
    uncategorisedCount: number;
    /** Recent logs (last 30 days) that land outside the current cycle. */
    strandedCount: number;
  };
  moved: { transferZar: number; contributionZar: number };
};

export async function getDataCheck(now: Date = new Date()): Promise<DataCheck> {
  const cycle = await getCurrentCycle(now);
  const floor = await cutoverFloor();

  const [recentRows, lineRows, catRows, byType, unbudgeted, unknown, uncategorised, moved] =
    await Promise.all([
      // Recent logs regardless of the cutover floor, so anything logged but
      // hidden/out-of-cycle still shows up here (that's the whole point).
      sql<{
        id: string; occurred_on: string; description: string; amount_zar: string;
        type: string; category: string | null; subcategory: string | null; account_label: string | null;
      }>`
        select t.id::text, t.occurred_on::text, t.description, t.amount_zar, t.type,
               t.category, t.subcategory, a.label as account_label
        from transactions t
        left join accounts a on a.id = t.account_id
        order by t.occurred_on desc, t.id desc
        limit 40`,

      // The expense budget-line categories for this cycle — the exact set a
      // transaction must match to count.
      sql<{ category: string }>`
        select b.category from budgets b
        join categories c on c.name = b.category and c.kind = 'expense'
        where b.cycle_start = ${cycle.start}::date`,

      sql<{ name: string }>`select name from categories`,

      sql<{ type: string; n: string }>`
        select type, count(*)::text n from transactions
        where occurred_on >= ${cycle.start}::date and occurred_on < ${cycle.end}::date
          and (${floor}::date is null or occurred_on >= ${floor}::date)
        group by type`,

      sql<{ category: string; amount_zar: string; n: string }>`
        select coalesce(t.category, 'Uncategorised') as category,
               sum(-t.amount_zar) as amount_zar, count(*)::text n
        from transactions t
        where t.type = 'expense'
          and t.category is not null
          and t.occurred_on >= ${cycle.start}::date and t.occurred_on < ${cycle.end}::date
          and (${floor}::date is null or t.occurred_on >= ${floor}::date)
          and not exists (
            select 1 from budgets b join categories c on c.name = b.category and c.kind = 'expense'
            where b.cycle_start = ${cycle.start}::date and b.category = t.category)
        group by 1 order by 2 desc`,

      sql<{ category: string; n: string }>`
        select t.category, count(*)::text n from transactions t
        where t.category is not null
          and t.occurred_on >= ${cycle.start}::date and t.occurred_on < ${cycle.end}::date
          and (${floor}::date is null or t.occurred_on >= ${floor}::date)
          and not exists (select 1 from categories c where c.name = t.category)
        group by t.category order by 2 desc`,

      sql<{ amount_zar: string; n: string }>`
        select coalesce(sum(-amount_zar), 0) as amount_zar, count(*)::text n
        from transactions
        where type = 'expense' and category is null
          and occurred_on >= ${cycle.start}::date and occurred_on < ${cycle.end}::date
          and (${floor}::date is null or occurred_on >= ${floor}::date)`,

      sql<{ transfer: string; contribution: string }>`
        select
          coalesce(sum(abs(amount_zar)) filter (where type = 'transfer'), 0) as transfer,
          coalesce(sum(abs(amount_zar)) filter (where type = 'contribution'), 0) as contribution
        from transactions
        where occurred_on >= ${cycle.start}::date and occurred_on < ${cycle.end}::date
          and (${floor}::date is null or occurred_on >= ${floor}::date)`,
    ]);

  const lineSet = new Set(lineRows.map((r) => r.category));
  const catSet = new Set(catRows.map((r) => r.name));

  const recent: LogCheck[] = recentRows.map((r) => {
    const inCycle = r.occurred_on >= cycle.start && r.occurred_on < cycle.end;
    const belowFloor = floor !== null && r.occurred_on < floor;
    let status: LogCheckStatus;
    let reason: string;
    if (belowFloor) {
      status = "hidden";
      reason = `Before your fresh start (${floor}) — hidden everywhere`;
    } else if (!inCycle) {
      status = "other-cycle";
      reason = `Dated ${r.occurred_on} — outside this cycle (${cycle.start} → ${cycle.end})`;
    } else if (r.type !== "expense") {
      status = "not-spend";
      reason = `${r.type} — never counts as budget spend`;
    } else if (!r.category) {
      status = "uncategorised";
      reason = "No category — can't match any budget line";
    } else if (!lineSet.has(r.category)) {
      status = "unbudgeted";
      reason = catSet.has(r.category)
        ? `No “${r.category}” budget line — sits under “spent outside any budget line”`
        : `Category “${r.category}” isn't in your category list — add a line for it`;
    } else {
      status = "ok";
      reason = `Counts under “${r.category}”`;
    }
    return {
      recordId: r.id,
      date: r.occurred_on,
      description: r.description,
      amountZar: Math.abs(money(r.amount_zar)),
      type: r.type,
      category: r.category,
      subcategory: r.subcategory,
      accountLabel: r.account_label,
      status,
      reason,
    };
  });

  const countFor = (t: string) => Number(byType.find((r) => r.type === t)?.n ?? 0);

  return {
    cycle: { start: cycle.start, end: cycle.end, floor },
    counts: {
      expense: countFor("expense"),
      income: countFor("income"),
      transfer: countFor("transfer"),
      contribution: countFor("contribution"),
    },
    recent,
    issues: {
      unbudgeted: unbudgeted.map((r) => ({
        category: r.category, amountZar: money(r.amount_zar), count: Number(r.n),
      })),
      unknownCategories: unknown.map((r) => ({ category: r.category, count: Number(r.n) })),
      uncategorisedZar: money(uncategorised[0]?.amount_zar),
      uncategorisedCount: Number(uncategorised[0]?.n ?? 0),
      strandedCount: recent.filter((r) => r.status === "other-cycle" || r.status === "hidden").length,
    },
    moved: {
      transferZar: money(moved[0]?.transfer),
      contributionZar: money(moved[0]?.contribution),
    },
  };
}
