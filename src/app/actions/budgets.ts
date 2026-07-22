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

    const existing = await sql<{ id: string }>`
      select id::text from budgets
      where cycle_start = ${cycleStart}::date and category = ${category}`;
    if (existing.length > 0) {
      // Two lines for one category would double the budget and split the spend.
      return { ok: false, error: `${category} already has a budget this cycle.` };
    }

    const created = await sql<{ id: string }>`
      insert into budgets (cycle_start, category, budgeted_zar, kind)
      values (${cycleStart}::date, ${category}, ${input.budgetedZar}, ${known[0].kind})
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
