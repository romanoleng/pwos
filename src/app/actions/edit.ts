"use server";

import { revalidateTag } from "next/cache";

import { TABLES } from "@/lib/airtable-fields";
import { editableField, validateEditable } from "@/lib/editable";
import { getRecord, numberCell, updateRecords } from "@/lib/server/airtable";

import type { MutationResult } from "./holdings";

/**
 * The single mutation entry point for editable numbers (CLAUDE.md §9b).
 *
 * The client passes a registry key, a record id and a value. It never names a
 * table or a field — see src/lib/editable.ts for why that boundary matters.
 */

export type EditResult = { previousValue: number | null; key: string; recordId: string };

const TABLE_BY_KEY = {
  netWorth: TABLES.netWorth,
  debtTracker: TABLES.debtTracker,
  savingsGoals: TABLES.savingsGoals,
  kidsAccounts: TABLES.kidsAccounts,
  budget: TABLES.budget,
  holdings: TABLES.holdings,
} as const;

export async function updateEditableValue(
  key: string,
  recordId: string,
  value: number,
): Promise<MutationResult<EditResult>> {
  const field = editableField(key);
  if (!field) return { ok: false, error: "That field isn't editable." };

  const invalid = validateEditable(field, value);
  if (invalid) return { ok: false, error: invalid };

  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
    return { ok: false, error: "Invalid record." };
  }

  const tableId = TABLE_BY_KEY[field.table];

  try {
    // Capture the previous value before writing, so undo restores what was
    // actually there rather than what the client believed.
    const existing = await getRecord(tableId, recordId);
    if (!existing) return { ok: false, error: "That record no longer exists." };
    const previousValue = numberCell(existing, field.fieldId);

    await updateRecords(tableId, [{ id: recordId, fields: { [field.fieldId]: value } }]);
    for (const tag of field.invalidates) revalidateTag(tag, "max");

    return { ok: true, data: { previousValue, key, recordId } };
  } catch (error) {
    console.error("[updateEditableValue]", key, error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save.",
    };
  }
}

/** Restores a previous value captured by updateEditableValue. Powers Undo. */
export async function revertEditableValue(
  key: string,
  recordId: string,
  previousValue: number | null,
): Promise<MutationResult> {
  const field = editableField(key);
  if (!field) return { ok: false, error: "That field isn't editable." };

  try {
    await updateRecords(TABLE_BY_KEY[field.table], [
      { id: recordId, fields: { [field.fieldId]: previousValue } },
    ]);
    for (const tag of field.invalidates) revalidateTag(tag, "max");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[revertEditableValue]", key, error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not undo.",
    };
  }
}
