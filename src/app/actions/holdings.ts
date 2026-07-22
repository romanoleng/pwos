"use server";

import { revalidateTag } from "next/cache";

import { money, moneyOrNull, sql } from "@/lib/server/db";

/** Holding mutations (CLAUDE.md §9b). */

export type MutationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type HoldingEdit = {
  quantity?: number; investedZar?: number; wallet?: string; notes?: string;
};

export type HoldingSnapshot = {
  recordId: string; quantity: number | null; investedZar: number | null;
  wallet: string | null; notes: string | null;
};

function invalidateCrypto(): void {
  revalidateTag("crypto", "max");
}

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

export async function updateHolding(
  recordId: string,
  edit: HoldingEdit,
): Promise<MutationResult<{ previous: HoldingSnapshot }>> {
  const invalid = validate(edit);
  if (invalid) return { ok: false, error: invalid };

  try {
    // Capture the prior state in the same statement so undo restores exactly
    // what was there rather than what the client believed.
    const rows = await sql<{
      quantity: string | null; invested_zar: string | null;
      wallet: string | null; notes: string | null;
    }>`
      update holdings u set
        quantity     = coalesce(${edit.quantity ?? null}, u.quantity),
        invested_zar = coalesce(${edit.investedZar ?? null}, u.invested_zar),
        wallet       = coalesce(${edit.wallet?.trim() ?? null}, u.wallet),
        notes        = ${edit.notes ?? null}
      from holdings old
      where old.id = u.id and u.id = ${recordId}::bigint
      returning old.quantity, old.invested_zar, old.wallet, old.notes`;

    if (rows.length === 0) return { ok: false, error: "That holding no longer exists." };
    invalidateCrypto();
    return {
      ok: true,
      data: {
        previous: {
          recordId,
          quantity: moneyOrNull(rows[0].quantity),
          investedZar: moneyOrNull(rows[0].invested_zar),
          wallet: rows[0].wallet,
          notes: rows[0].notes,
        },
      },
    };
  } catch (error) {
    console.error("[updateHolding]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not save." };
  }
}

export async function restoreHolding(previous: HoldingSnapshot): Promise<MutationResult> {
  try {
    await sql`
      update holdings set quantity = ${previous.quantity}, invested_zar = ${previous.investedZar},
                          wallet = ${previous.wallet}, notes = ${previous.notes}
      where id = ${previous.recordId}::bigint`;
    invalidateCrypto();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[restoreHolding]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not undo." };
  }
}

/**
 * Archive, not delete (CLAUDE.md §9b). The position leaves the app but stays in
 * the table; unticking restores it, which is why this pairs with an undo toast
 * rather than a confirmation dialog.
 */
export async function setHoldingArchived(
  recordId: string,
  archived: boolean,
): Promise<MutationResult> {
  try {
    await sql`update holdings set archived = ${archived} where id = ${recordId}::bigint`;
    invalidateCrypto();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[setHoldingArchived]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not archive it." };
  }
}

export type NewHolding = {
  symbol: string; coin?: string; wallet: string;
  quantity: number; investedZar: number; notes?: string;
};

export async function createHolding(
  input: NewHolding,
): Promise<MutationResult<{ recordId: string }>> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) {
    return { ok: false, error: "Symbol should be 1-12 letters or digits." };
  }
  const invalid = validate({ quantity: input.quantity, investedZar: input.investedZar });
  if (invalid) return { ok: false, error: invalid };
  if (!input.wallet.trim()) return { ok: false, error: "Wallet is required." };

  try {
    const rows = await sql<{ id: string }>`
      insert into holdings (symbol, coin, wallet, quantity, invested_zar, notes)
      values (${symbol}, ${input.coin?.trim() || symbol}, ${input.wallet.trim()},
              ${input.quantity}, ${input.investedZar}, ${input.notes || null})
      returning id::text`;
    invalidateCrypto();
    return { ok: true, data: { recordId: rows[0].id } };
  } catch (error) {
    console.error("[createHolding]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not add it." };
  }
}

export { money };
