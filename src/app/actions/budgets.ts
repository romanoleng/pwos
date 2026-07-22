"use server";

import { revalidateTag } from "next/cache";

import { getCurrentCycle } from "@/lib/server/cycle";
import { sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Budget management (CLAUDE.md §9b).
 *
 * Budgets are the numbers Romano is still working out, so every one of them has
 * to be his to change — adding a line, removing one, and starting a fresh cycle
 * all belong in the app rather than in a migration I have to write for him.
 *
 * A cycle runs payday to payday. Lines are per cycle, so changing July never
 * rewrites what June actually looked like.
 */

function invalidate(): void {
  for (const tag of ["budget", "transactions", "wealth"]) revalidateTag(tag, "max");
}

/** Money in, money out, or money moved — mirrors the categories table. */
type CategoryKind = "expense" | "income" | "transfer" | "contribution";

export type BudgetLineSnapshot = {
  cycleStart: string;
  category: string;
  budgetedZar: number;
  kind: string | null;
  notes: string | null;
};

export async function createBudgetLine(input: {
  category: string;
  budgetedZar: number;
  cycleStart?: string;
  /** How predictable the line is: "Fixed" or "Variable". Not the money's kind. */
  kind?: string;
}): Promise<MutationResult<{ recordId: string }>> {
  const category = input.category.trim();
  if (!category) return { ok: false, error: "Pick a category." };
  if (!Number.isFinite(input.budgetedZar) || input.budgetedZar < 0) {
    return { ok: false, error: "Amount can't be negative." };
  }

  const cycleStart = input.cycleStart || (await getCurrentCycle()).start;

  try {
    const known = await sql<{ kind: string }>`
      select kind::text from categories where name = ${category}`;
    if (known.length === 0) {
      return { ok: false, error: `${category} isn't a category yet.` };
    }
    if (known[0].kind !== "expense") {
      // The budget tracks what he spends to live. Money put away is planned on
      // Goals against the thing it funds.
      return { ok: false, error: `${category} is money put away — plan it on Goals.` };
    }

    const existing = await sql<{ id: string }>`
      select id::text from budgets
      where cycle_start = ${cycleStart}::date and category = ${category}`;
    if (existing.length > 0) {
      // Two lines for one category would double the budget and split the spend.
      return { ok: false, error: `${category} already has a budget this cycle.` };
    }

    const created = await sql<{ id: string }>`
      insert into budgets (cycle_start, category, budgeted_zar, kind)
      values (${cycleStart}::date, ${category}, ${input.budgetedZar}, ${input.kind ?? null})
      returning id::text`;

    invalidate();
    return { ok: true, data: { recordId: created[0].id } };
  } catch (error) {
    console.error("[createBudgetLine]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't add it." };
  }
}

export async function deleteBudgetLine(
  recordId: string,
): Promise<MutationResult<{ snapshot: BudgetLineSnapshot }>> {
  try {
    const rows = await sql<{
      cycle_start: string; category: string; budgeted_zar: string;
      kind: string | null; notes: string | null;
    }>`
      delete from budgets where id = ${recordId}::bigint
      returning cycle_start::text, category, budgeted_zar, kind, notes`;
    if (rows.length === 0) return { ok: false, error: "That line no longer exists." };

    invalidate();
    return {
      ok: true,
      data: {
        snapshot: {
          cycleStart: rows[0].cycle_start,
          category: rows[0].category,
          budgetedZar: Number(rows[0].budgeted_zar),
          kind: rows[0].kind,
          notes: rows[0].notes,
        },
      },
    };
  } catch (error) {
    console.error("[deleteBudgetLine]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't remove it." };
  }
}

/** Undo for the above. Transactions are untouched, so nothing is lost either way. */
export async function restoreBudgetLine(
  snapshot: BudgetLineSnapshot,
): Promise<MutationResult> {
  try {
    await sql`
      insert into budgets (cycle_start, category, budgeted_zar, kind, notes)
      values (${snapshot.cycleStart}::date, ${snapshot.category}, ${snapshot.budgetedZar},
              ${snapshot.kind}, ${snapshot.notes})`;
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[restoreBudgetLine]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't restore it." };
  }
}

/**
 * Fill an empty cycle from the one before it.
 *
 * Without this, every payday would open on a blank budget screen and the month
 * would start with no plan at all. Copying last cycle's lines is a starting
 * point to adjust, not a commitment — the amounts are editable the moment they
 * land.
 */
export async function copyBudgetsForward(): Promise<
  MutationResult<{ copied: number; from: string }>
> {
  const cycle = await getCurrentCycle();
  try {
    const already = await sql<{ n: string }>`
      select count(*)::text as n from budgets where cycle_start = ${cycle.start}::date`;
    if (Number(already[0].n) > 0) {
      return { ok: false, error: "This cycle already has budget lines." };
    }

    const previous = await sql<{ cycle_start: string }>`
      select cycle_start::text from budgets
      where cycle_start < ${cycle.start}::date
      order by cycle_start desc limit 1`;
    if (previous.length === 0) return { ok: false, error: "There's no earlier cycle to copy." };

    const copied = await sql<{ id: string }>`
      insert into budgets (cycle_start, category, budgeted_zar, kind)
      select ${cycle.start}::date, category, budgeted_zar, kind
      from budgets where cycle_start = ${previous[0].cycle_start}::date
      returning id::text`;

    invalidate();
    return { ok: true, data: { copied: copied.length, from: previous[0].cycle_start } };
  } catch (error) {
    console.error("[copyBudgetsForward]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't copy them." };
  }
}

/**
 * Open a new cycle using what the last one actually cost.
 *
 * A budget copied forward repeats last month's guesses. Seeding from real spend
 * lets the numbers converge on the truth over a few cycles, which is the point
 * of tracking at all.
 *
 * The catch, and it's why the caller shows both figures: this is only as good
 * as the logging behind it. A cycle where half the spending never got entered
 * seeds a budget that's too low.
 */
export async function seedBudgetsFromActuals(): Promise<
  MutationResult<{ created: number; from: string; totalZar: number }>
> {
  const cycle = await getCurrentCycle();
  try {
    const already = await sql<{ n: string }>`
      select count(*)::text as n from budgets where cycle_start = ${cycle.start}::date`;
    if (Number(already[0].n) > 0) {
      return { ok: false, error: "This cycle already has budget lines." };
    }

    const previous = await sql<{ cycle_start: string }>`
      select cycle_start::text from budgets
      where cycle_start < ${cycle.start}::date
      order by cycle_start desc limit 1`;
    if (previous.length === 0) return { ok: false, error: "There's no earlier cycle to learn from." };
    const from = previous[0].cycle_start;

    // Every expense category with real spend in the previous cycle, plus the
    // lines that were budgeted then — a category budgeted but not spent is
    // still a commitment worth carrying (insurance, a bill not yet due).
    const created = await sql<{ id: string }>`
      with spend as (
        select t.category,
               sum(-t.amount_zar) as actual_zar
        from transactions t
        join categories c on c.name = t.category and c.kind = 'expense'
        where t.type = 'expense'
          and t.occurred_on >= ${from}::date
          and t.occurred_on <  ${cycle.start}::date
        group by t.category
        having sum(-t.amount_zar) > 0
      ),
      prior as (
        select b.category, b.kind, b.budgeted_zar
        from budgets b
        join categories c on c.name = b.category and c.kind = 'expense'
        where b.cycle_start = ${from}::date
      )
      insert into budgets (cycle_start, category, budgeted_zar, kind)
      select ${cycle.start}::date,
             coalesce(spend.category, prior.category),
             -- Rounded to the nearest R10: a budget of R2 421,72 is false
             -- precision, and it is a target rather than a measurement.
             round(coalesce(spend.actual_zar, prior.budgeted_zar) / 10) * 10,
             prior.kind
      from spend full outer join prior on prior.category = spend.category
      returning id::text`;

    const total = await sql<{ t: string }>`
      select coalesce(sum(budgeted_zar), 0) as t from budgets
      where cycle_start = ${cycle.start}::date`;

    invalidate();
    return {
      ok: true,
      data: { created: created.length, from, totalZar: Number(total[0].t) },
    };
  } catch (error) {
    console.error("[seedBudgetsFromActuals]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't seed them." };
  }
}

/**
 * Add a category, so a budget line can exist for something the app has never
 * seen. New categories appear in the log sheet's picker immediately — one list,
 * one source.
 */
export async function createCategory(input: {
  name: string;
  kind: CategoryKind;
  pinned?: boolean;
}): Promise<MutationResult<{ name: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give it a name." };
  if (name.length > 60) return { ok: false, error: "That name is too long." };

  try {
    const existing = await sql<{ name: string }>`
      select name from categories where lower(name) = ${name.toLowerCase()}`;
    if (existing.length > 0) {
      return { ok: false, error: `${existing[0].name} already exists.` };
    }

    // Sort new categories to the end rather than renumbering existing ones.
    await sql`
      insert into categories (name, kind, sort_order, pinned)
      values (${name}, ${input.kind}::transaction_type,
              coalesce((select max(sort_order) from categories), 0) + 1,
              ${input.pinned ?? false})`;

    for (const tag of ["budget", "transactions", "home"]) revalidateTag(tag, "max");
    return { ok: true, data: { name } };
  } catch (error) {
    console.error("[createCategory]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't add it." };
  }
}
