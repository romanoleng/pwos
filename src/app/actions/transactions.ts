"use server";

import { revalidateTag } from "next/cache";

import { FIELDS, TABLES } from "@/lib/airtable-fields";
import { toLocalISODate } from "@/lib/crypto/history";
import { createRecords, getRecord, stringCell, updateRecords } from "@/lib/server/airtable";
import type { MutationResult } from "@/app/actions/holdings";

/**
 * Transaction logging (CLAUDE.md §5, §9b).
 *
 * Daily entry is the highest-frequency action in the app, so this is
 * deliberately forgiving: amount sign is derived from the chosen direction
 * rather than requiring the user to remember a minus, and the date defaults to
 * today in Johannesburg.
 *
 * NOTE: there is still no Type field in Airtable, so type is not written here.
 * It is inferred on read (src/lib/transactions.ts). Once the field exists this
 * action should write it, and the inference becomes a fallback for old rows.
 */

export type NewTransaction = {
  description: string;
  /** Always positive; direction decides the stored sign. */
  amountZar: number;
  direction: "out" | "in";
  category: string;
  account: string;
  /** ISO yyyy-mm-dd. Defaults to today in Africa/Johannesburg. */
  date?: string;
  notes?: string;
};

function invalidate(): void {
  revalidateTag("transactions", "max");
  revalidateTag("accounts", "max");
}

export async function createTransaction(
  input: NewTransaction,
): Promise<MutationResult<{ recordId: string }>> {
  const description = input.description.trim();
  if (!description) return { ok: false, error: "Give it a description." };

  if (!Number.isFinite(input.amountZar) || input.amountZar <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }
  if (!input.category) return { ok: false, error: "Pick a category." };
  if (!input.account) return { ok: false, error: "Pick an account." };

  // Money out is stored negative, matching every existing row in the table.
  const signed = input.direction === "out" ? -Math.abs(input.amountZar) : Math.abs(input.amountZar);

  try {
    const [created] = await createRecords(TABLES.transactions, [
      {
        fields: {
          [FIELDS.transactions.description]: description,
          [FIELDS.transactions.amount]: signed,
          [FIELDS.transactions.category]: input.category,
          [FIELDS.transactions.account]: input.account,
          [FIELDS.transactions.date]: input.date || toLocalISODate(new Date()),
          ...(input.notes ? { [FIELDS.transactions.notes]: input.notes } : {}),
        },
      },
    ]);
    invalidate();
    return { ok: true, data: { recordId: created.id } };
  } catch (error) {
    console.error("[createTransaction]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not log it.",
    };
  }
}

/**
 * Undo for a just-logged transaction.
 *
 * Airtable has no soft delete and the app has no delete helper by design
 * (§9b), so an undone entry is blanked to R0 and marked, leaving an auditable
 * row rather than a silent hole in the ledger. It can be tidied in Airtable.
 */
export async function voidTransaction(recordId: string): Promise<MutationResult> {
  try {
    const record = await getRecord(TABLES.transactions, recordId);
    if (!record) return { ok: false, error: "That entry no longer exists." };

    const existing = stringCell(record, FIELDS.transactions.description) ?? "";

    await updateRecords(TABLES.transactions, [
      {
        id: recordId,
        fields: {
          [FIELDS.transactions.amount]: 0,
          [FIELDS.transactions.description]: `[voided] ${existing}`,
          [FIELDS.transactions.notes]: `Voided from PWOS on ${toLocalISODate(new Date())}.`,
        },
      },
    ]);
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[voidTransaction]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not undo it.",
    };
  }
}
