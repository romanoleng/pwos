"use server";

import { revalidateTag } from "next/cache";

import { TABLES } from "@/lib/airtable-fields";
import { editableField, validateEditable } from "@/lib/editable";
import { getRecord, numberCell, updateRecords } from "@/lib/server/airtable";

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
  netWorth: TABLES.netWorth,
  debtTracker: TABLES.debtTracker,
  savingsGoals: TABLES.savingsGoals,
  kidsAccounts: TABLES.kidsAccounts,
  budget: TABLES.budget,
  holdings: TABLES.holdings,
} as const;

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
  const byTable = new Map<string, { id: string; fields: Record<string, unknown> }[]>();
  for (const change of changes) {
    const field = editableField(change.editKey);
    if (!field) return { ok: false, error: `Unknown field: ${change.editKey}` };

    const invalid = validateEditable(field, change.value);
    if (invalid) return { ok: false, error: `${field.label}: ${invalid}` };

    if (!/^rec[A-Za-z0-9]{14}$/.test(change.recordId)) {
      return { ok: false, error: "Invalid record reference." };
    }

    const tableId = TABLE_BY_KEY[field.table];
    const list = byTable.get(tableId) ?? [];
    list.push({ id: change.recordId, fields: { [field.fieldId]: change.value } });
    byTable.set(tableId, list);
  }

  try {
    const previous: ResetPrevious[] = [];
    for (const change of changes) {
      const field = editableField(change.editKey)!;
      const record = await getRecord(TABLE_BY_KEY[field.table], change.recordId);
      previous.push({
        editKey: change.editKey,
        recordId: change.recordId,
        value: record ? numberCell(record, field.fieldId) : null,
      });
    }

    let applied = 0;
    for (const [tableId, records] of byTable) {
      const written = await updateRecords(tableId, records);
      applied += written.length;
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
    const byTable = new Map<string, { id: string; fields: Record<string, unknown> }[]>();
    for (const entry of previous) {
      const field = editableField(entry.editKey);
      if (!field) continue;
      const tableId = TABLE_BY_KEY[field.table];
      const list = byTable.get(tableId) ?? [];
      list.push({ id: entry.recordId, fields: { [field.fieldId]: entry.value } });
      byTable.set(tableId, list);
    }
    for (const [tableId, records] of byTable) await updateRecords(tableId, records);
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
