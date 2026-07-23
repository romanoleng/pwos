"use server";

import { revalidateTag } from "next/cache";

import { query, sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Category management (build report item 06).
 *
 * Renaming, merging and retiring a category all needed a migration from me
 * until now — the last real hole in the self-service goal, and the reason the
 * contribution mismatch couldn't be cleaned up.
 *
 * Subcategories exist since 2026-07-23 as an OPTIONAL second level (see
 * lib/server/logmeta.ts) — the original "no subcategories" rule protected
 * entry speed, and that protection stands: a subcategory is never required
 * and the logger only shows the field once a category has any. Merging and
 * renaming here operate on categories; a renamed category keeps its
 * subcategories via ON UPDATE CASCADE.
 */

function invalidate(): void {
  for (const tag of ["budget", "transactions", "home", "goals", "wealth"]) {
    revalidateTag(tag, "max");
  }
}

/**
 * Rename in place.
 *
 * Non-destructive and, pleasingly, free: transactions.category is declared
 * ON UPDATE CASCADE, so every tagged row follows the new name in the same
 * statement. Nothing forks, no history is rewritten.
 */
export async function renameCategory(
  from: string,
  to: string,
): Promise<MutationResult<{ from: string; to: string; moved: number }>> {
  const target = to.trim();
  if (!target) return { ok: false, error: "Give it a name." };
  if (target.length > 60) return { ok: false, error: "That name is too long." };
  if (target === from) return { ok: false, error: "That's already its name." };

  try {
    const clash = await sql<{ name: string }>`
      select name from categories where lower(name) = ${target.toLowerCase()} and name <> ${from}`;
    if (clash.length > 0) {
      return {
        ok: false,
        error: `${clash[0].name} already exists — merge into it instead of renaming.`,
      };
    }

    const [{ n }] = await sql<{ n: string }>`
      select count(*)::text as n from transactions where category = ${from}`;

    const renamed = await sql<{ name: string }>`
      update categories set name = ${target} where name = ${from} returning name`;
    if (renamed.length === 0) return { ok: false, error: "That category no longer exists." };

    // Budgets reference the category by name and have no cascade of their own.
    await sql`update budgets set category = ${target} where category = ${from}`;

    invalidate();
    return { ok: true, data: { from, to: target, moved: Number(n) } };
  } catch (error) {
    console.error("[renameCategory]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't rename it." };
  }
}

export type MergeUndo = {
  source: string;
  target: string;
  /** Transactions retagged, so the merge can be reversed exactly. */
  transactionIds: string[];
  budgetIds: string[];
};

/**
 * Fold one category into another and retag everything that used it.
 *
 * This is what actually fixes the contribution mismatch: "Crypto DCA" has a
 * budget but no transactions, while "Crypto Investment" has the transactions
 * and no plan. Merging makes planned-versus-actual mean something.
 *
 * The source is archived rather than deleted, and the retagged ids come back
 * so the whole thing can be undone.
 */
export async function mergeCategories(
  source: string,
  target: string,
): Promise<MutationResult<{ moved: number; undo: MergeUndo }>> {
  if (source === target) return { ok: false, error: "Pick two different categories." };

  try {
    const both = await sql<{ name: string; kind: string }>`
      select name, kind::text from categories where name in (${source}, ${target})`;
    if (both.length < 2) return { ok: false, error: "One of those no longer exists." };

    const sourceKind = both.find((c) => c.name === source)?.kind;
    const targetKind = both.find((c) => c.name === target)?.kind;
    if (sourceKind !== targetKind) {
      // Merging spending into a contribution would silently reclassify money
      // as saved rather than spent, and every total would shift.
      return {
        ok: false,
        error: `${source} is ${sourceKind} and ${target} is ${targetKind}. Merging them would change what the money means.`,
      };
    }

    const moved = await sql<{ id: string }>`
      update transactions set category = ${target}
      where category = ${source} returning id::text`;

    // A budget line for the source folds its amount into the target's line for
    // the same cycle, rather than being dropped or duplicating the category.
    const budgets = await sql<{ id: string }>`
      select id::text from budgets where category = ${source}`;
    await sql`
      update budgets b set budgeted_zar = b.budgeted_zar + s.budgeted_zar
      from budgets s
      where s.category = ${source} and b.category = ${target}
        and b.cycle_start = s.cycle_start`;
    await sql`
      update budgets set category = ${target}
      where category = ${source}
        and not exists (
          select 1 from budgets t
          where t.category = ${target} and t.cycle_start = budgets.cycle_start)`;
    await sql`delete from budgets where category = ${source}`;

    await sql`update categories set archived = true where name = ${source}`;

    invalidate();
    return {
      ok: true,
      data: {
        moved: moved.length,
        undo: {
          source, target,
          transactionIds: moved.map((r) => r.id),
          budgetIds: budgets.map((r) => r.id),
        },
      },
    };
  } catch (error) {
    console.error("[mergeCategories]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't merge them." };
  }
}

/** Put a merge back. Only the rows this merge touched are moved. */
export async function undoMerge(undo: MergeUndo): Promise<MutationResult> {
  try {
    await sql`update categories set archived = false where name = ${undo.source}`;
    if (undo.transactionIds.length > 0) {
      await query(
        `update transactions set category = $1 where id = any($2::bigint[])`,
        [undo.source, undo.transactionIds],
      );
    }
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[undoMerge]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't undo it." };
  }
}

/**
 * Retire a category without touching what it already tagged.
 *
 * It leaves every picker, but historical transactions keep the tag and still
 * total — deleting would orphan them or force a retag nobody asked for.
 */
export async function archiveCategory(
  name: string,
  archived = true,
): Promise<MutationResult<{ name: string; stillTagging: number }>> {
  try {
    const updated = await sql<{ name: string }>`
      update categories set archived = ${archived} where name = ${name} returning name`;
    if (updated.length === 0) return { ok: false, error: "That category no longer exists." };

    const [{ n }] = await sql<{ n: string }>`
      select count(*)::text as n from transactions where category = ${name}`;

    invalidate();
    return { ok: true, data: { name, stillTagging: Number(n) } };
  } catch (error) {
    console.error("[archiveCategory]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't archive it." };
  }
}

/** Pinned categories are the log sheet's quick-tap chips. */
export async function setCategoryPinned(
  name: string,
  pinned: boolean,
): Promise<MutationResult<{ name: string; pinned: boolean }>> {
  try {
    await sql`update categories set pinned = ${pinned} where name = ${name}`;
    invalidate();
    return { ok: true, data: { name, pinned } };
  } catch (error) {
    console.error("[setCategoryPinned]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't change it." };
  }
}

/**
 * One order, used everywhere — the chips, the pickers and the budget list all
 * read sort_order, so this can't leave three screens disagreeing.
 */
export async function reorderCategory(
  name: string,
  direction: "up" | "down",
): Promise<MutationResult> {
  try {
    const [current] = await sql<{ kind: string; sort_order: number }>`
      select kind::text, sort_order from categories where name = ${name}`;
    if (!current) return { ok: false, error: "That category no longer exists." };

    // Swap with the nearest neighbour of the same kind: income and expense are
    // separate lists, so crossing them would be meaningless.
    const [neighbour] = direction === "up"
      ? await sql<{ name: string; sort_order: number }>`
          select name, sort_order from categories
          where kind = ${current.kind}::transaction_type and not archived
            and sort_order < ${current.sort_order}
          order by sort_order desc limit 1`
      : await sql<{ name: string; sort_order: number }>`
          select name, sort_order from categories
          where kind = ${current.kind}::transaction_type and not archived
            and sort_order > ${current.sort_order}
          order by sort_order asc limit 1`;
    if (!neighbour) return { ok: false, error: "It's already at the end." };

    await sql`update categories set sort_order = ${neighbour.sort_order} where name = ${name}`;
    await sql`update categories set sort_order = ${current.sort_order} where name = ${neighbour.name}`;

    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[reorderCategory]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reorder it." };
  }
}
