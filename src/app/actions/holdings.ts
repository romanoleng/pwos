"use server";

import { revalidateTag } from "next/cache";

import { FIELDS, TABLES } from "@/lib/airtable-fields";
import {
  createRecords,
  getRecord,
  numberCell,
  stringCell,
  updateRecords,
} from "@/lib/server/airtable";

/**
 * Holding mutations (CLAUDE.md §9b).
 *
 * Every action validates server-side and writes only the fields it owns. The
 * browser never composes a payload — it sends intent, and the server decides
 * what that means in Airtable.
 *
 * Each mutation returns the *previous* values so the UI can offer a real undo
 * that restores exactly what was there, rather than replaying a stale client copy.
 */

export type HoldingEdit = {
  quantity?: number;
  investedZar?: number;
  wallet?: string;
  notes?: string;
};

export type MutationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Snapshot of the fields an edit can touch, used to undo it. */
export type HoldingSnapshot = {
  recordId: string;
  quantity: number | null;
  investedZar: number | null;
  wallet: string | null;
  notes: string | null;
};

function validate(edit: HoldingEdit): string | null {
  if (edit.quantity !== undefined) {
    if (!Number.isFinite(edit.quantity)) return "Quantity must be a number.";
    if (edit.quantity < 0) return "Quantity can't be negative.";
  }
  if (edit.investedZar !== undefined) {
    if (!Number.isFinite(edit.investedZar)) return "Invested must be a number.";
    if (edit.investedZar < 0) return "Invested can't be negative.";
  }
  if (edit.wallet !== undefined && edit.wallet.trim().length === 0) {
    return "Wallet can't be empty.";
  }
  return null;
}

function toFields(edit: HoldingEdit): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (edit.quantity !== undefined) fields[FIELDS.holdings.quantity] = edit.quantity;
  if (edit.investedZar !== undefined) {
    fields[FIELDS.holdings.investedZar] = edit.investedZar;
  }
  if (edit.wallet !== undefined) fields[FIELDS.holdings.wallet] = edit.wallet.trim();
  if (edit.notes !== undefined) fields[FIELDS.holdings.notes] = edit.notes;
  return fields;
}

async function snapshot(recordId: string): Promise<HoldingSnapshot | null> {
  const record = await getRecord(TABLES.holdings, recordId);
  if (!record) return null;
  return {
    recordId,
    quantity: numberCell(record, FIELDS.holdings.quantity),
    investedZar: numberCell(record, FIELDS.holdings.investedZar),
    wallet: stringCell(record, FIELDS.holdings.wallet),
    notes: stringCell(record, FIELDS.holdings.notes),
  };
}

/**
 * Read-your-writes (§9b): every screen derived from crypto data — Home, Net
 * Worth, Wealth — must reflect a change immediately rather than showing a
 * stale figure beside a fresh one.
 */
function invalidateCrypto(): void {
  revalidateTag("crypto", "max");
}

export async function updateHolding(
  recordId: string,
  edit: HoldingEdit,
): Promise<MutationResult<{ previous: HoldingSnapshot }>> {
  const invalid = validate(edit);
  if (invalid) return { ok: false, error: invalid };

  const fields = toFields(edit);
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  try {
    // Capture prior state *before* writing, so undo restores exactly what was
    // there rather than what the client believed was there.
    const previous = await snapshot(recordId);
    if (!previous) return { ok: false, error: "That holding no longer exists." };

    await updateRecords(TABLES.holdings, [{ id: recordId, fields }]);
    invalidateCrypto();
    return { ok: true, data: { previous } };
  } catch (error) {
    console.error("[updateHolding]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the change.",
    };
  }
}

/** Restores a snapshot captured by updateHolding. Powers the Undo button. */
export async function restoreHolding(
  previous: HoldingSnapshot,
): Promise<MutationResult> {
  try {
    await updateRecords(TABLES.holdings, [
      {
        id: previous.recordId,
        fields: {
          [FIELDS.holdings.quantity]: previous.quantity,
          [FIELDS.holdings.investedZar]: previous.investedZar,
          [FIELDS.holdings.wallet]: previous.wallet,
          [FIELDS.holdings.notes]: previous.notes,
        },
      },
    ]);
    invalidateCrypto();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[restoreHolding]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not undo.",
    };
  }
}

/**
 * Archive, not delete (CLAUDE.md §9b).
 *
 * Sets the Archived checkbox so the position leaves the app but survives in
 * Airtable indefinitely. Unticking it restores the row, which is why this
 * pairs with an undo toast rather than a confirmation dialog.
 */
export async function setHoldingArchived(
  recordId: string,
  archived: boolean,
): Promise<MutationResult> {
  try {
    await updateRecords(TABLES.holdings, [
      { id: recordId, fields: { [FIELDS.holdings.archived]: archived } },
    ]);
    invalidateCrypto();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[setHoldingArchived]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not archive it.",
    };
  }
}

export type NewHolding = {
  symbol: string;
  coin?: string;
  wallet: string;
  quantity: number;
  investedZar: number;
  notes?: string;
};

/**
 * Logs a new position. Additive — creates a row and never modifies an existing
 * one, so the worst case of a mistake is a spare row you can edit.
 */
export async function createHolding(
  input: NewHolding,
): Promise<MutationResult<{ recordId: string }>> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, error: "Symbol is required." };
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) {
    return { ok: false, error: "Symbol should be 1-12 letters or digits." };
  }
  const invalid = validate({ quantity: input.quantity, investedZar: input.investedZar });
  if (invalid) return { ok: false, error: invalid };
  if (!input.wallet.trim()) return { ok: false, error: "Wallet is required." };

  try {
    const [created] = await createRecords(TABLES.holdings, [
      {
        fields: {
          [FIELDS.holdings.symbol]: symbol,
          [FIELDS.holdings.coin]: input.coin?.trim() || symbol,
          [FIELDS.holdings.wallet]: input.wallet.trim(),
          [FIELDS.holdings.quantity]: input.quantity,
          [FIELDS.holdings.investedZar]: input.investedZar,
          ...(input.notes ? { [FIELDS.holdings.notes]: input.notes } : {}),
        },
      },
    ]);
    invalidateCrypto();
    return { ok: true, data: { recordId: created.id } };
  } catch (error) {
    console.error("[createHolding]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add the holding.",
    };
  }
}
