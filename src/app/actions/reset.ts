"use server";

import { revalidateTag } from "next/cache";

import { editableField, validateEditable } from "@/lib/editable";
import { moneyOrNull, query } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Batch apply for the payday reset (CLAUDE.md §9b).
 *
 * Same allow-list as single-field editing: the client sends registry keys, not
 * table or field ids. Batching does not relax that — a bulk endpoint is exactly
 * where a loose contract would do the most damage.
 *
 * Every previous value is captured before writing so the whole reset can be
 * undone as one unit. A partial reset is worse than none: it leaves some
 * balances updated and others not, with no way to tell which.
 */

export type ResetChange = { editKey: string; recordId: string; value: number };

export type ResetPrevious = { editKey: string; recordId: string; value: number | null };

const TABLE_BY_KEY = {
  accounts: "accounts",
  assets: "assets",
  debtTracker: "debts",
  savingsGoals: "goals",
  kidsAccounts: "kids_accounts",
  budget: "budgets",
  holdings: "holdings",
} as const;

const TEXT_ID = new Set(["accounts"]);

function invalidateAll(): void {
  for (const tag of ["accounts", "networth", "wealth", "debt", "budget", "goals", "kids"]) {
    revalidateTag(tag, "max");
  }
}

export async function applyReset(
  changes: ResetChange[],
): Promise<MutationResult<{ applied: number; previous: ResetPrevious[] }>> {
  if (changes.length === 0) return { ok: false, error: "Nothing to apply." };
  if (changes.length > 200) return { ok: false, error: "Too many changes in one go." };

  // Validate everything before writing anything. Half-applying a reset would
  // leave the app in a state nobody can reason about.
  for (const change of changes) {
    const field = editableField(change.editKey);
    if (!field) return { ok: false, error: `Unknown field: ${change.editKey}` };
    const invalid = validateEditable(field, change.value);
    if (invalid) return { ok: false, error: `${field.label}: ${invalid}` };
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(change.recordId)) {
      return { ok: false, error: "Invalid record reference." };
    }
  }

  try {
    const previous: ResetPrevious[] = [];
    let applied = 0;

    for (const change of changes) {
      const field = editableField(change.editKey)!;
      const table = TABLE_BY_KEY[field.table];
      const cast = TEXT_ID.has(table) ? "" : "::bigint";
      const rows = await query<{ previous: unknown }>(
        `update ${table} u set ${field.fieldId} = $1
         from ${table} old where old.id = u.id and u.id = $2${cast}
         returning old.${field.fieldId} as previous`,
        [change.value, change.recordId],
      );
      if (rows.length === 0) continue;
      previous.push({
        editKey: change.editKey,
        recordId: change.recordId,
        value: moneyOrNull(rows[0].previous),
      });
      applied += 1;
    }

    invalidateAll();
    return { ok: true, data: { applied, previous } };
  } catch (error) {
    console.error("[applyReset]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not apply the reset.",
    };
  }
}

/** Restores every value captured by applyReset. Powers the undo. */
export async function revertReset(previous: ResetPrevious[]): Promise<MutationResult> {
  try {
    for (const entry of previous) {
      const field = editableField(entry.editKey);
      if (!field) continue;
      const table = TABLE_BY_KEY[field.table];
      const cast = TEXT_ID.has(table) ? "" : "::bigint";
      await query(`update ${table} set ${field.fieldId} = $1 where id = $2${cast}`,
        [entry.value, entry.recordId]);
    }
    invalidateAll();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[revertReset]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not undo the reset.",
    };
  }
}
