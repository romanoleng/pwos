"use server";

import { revalidateTag } from "next/cache";

import { editableField, validateEditable } from "@/lib/editable";
import { moneyOrNull, query } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * The single mutation entry point for editable numbers (CLAUDE.md §9b).
 *
 * The client sends a registry key, a record id and a value — never a table or
 * column name. See src/lib/editable.ts for why that boundary matters.
 */

export type EditResult = { previousValue: number | null; key: string; recordId: string };

/** Registry table → real table. Both sides are fixed, never client input. */
const TABLE_BY_KEY = {
  accounts: "accounts",
  assets: "assets",
  debtTracker: "debts",
  savingsGoals: "goals",
  kidsAccounts: "kids_accounts",
  budget: "budgets",
  holdings: "holdings",
} as const;

/** accounts.id is text; every other table uses bigint. */
const TEXT_ID = new Set(["accounts"]);

function target(key: string) {
  const field = editableField(key);
  if (!field) return null;
  const table = TABLE_BY_KEY[field.table];
  return { field, table, cast: TEXT_ID.has(table) ? "" : "::bigint" };
}

export async function updateEditableValue(
  key: string,
  recordId: string,
  value: number,
): Promise<MutationResult<EditResult>> {
  const t = target(key);
  if (!t) return { ok: false, error: "That field isn't editable." };

  const invalid = validateEditable(t.field, value);
  if (invalid) return { ok: false, error: invalid };
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(recordId)) {
    return { ok: false, error: "Invalid record." };
  }

  try {
    // Return the prior value from the same statement, so undo restores exactly
    // what was there and nothing can change in between.
    const rows = await query<{ previous: unknown }>(
      `update ${t.table} u set ${t.field.fieldId} = $1
       from ${t.table} old where old.id = u.id and u.id = $2${t.cast}
       returning old.${t.field.fieldId} as previous`,
      [value, recordId],
    );
    if (rows.length === 0) return { ok: false, error: "That record no longer exists." };

    for (const tag of t.field.invalidates) revalidateTag(tag, "max");
    return { ok: true, data: { previousValue: moneyOrNull(rows[0].previous), key, recordId } };
  } catch (error) {
    console.error("[updateEditableValue]", key, error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not save." };
  }
}

export async function revertEditableValue(
  key: string,
  recordId: string,
  previousValue: number | null,
): Promise<MutationResult> {
  const t = target(key);
  if (!t) return { ok: false, error: "That field isn't editable." };

  try {
    await query(
      `update ${t.table} set ${t.field.fieldId} = $1 where id = $2${t.cast}`,
      [previousValue, recordId],
    );
    for (const tag of t.field.invalidates) revalidateTag(tag, "max");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[revertEditableValue]", key, error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not undo." };
  }
}
