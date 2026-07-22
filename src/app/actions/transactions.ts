"use server";

import { revalidateTag } from "next/cache";

import { resolveAccount } from "@/lib/accounts";
import { FIELDS, TABLES } from "@/lib/airtable-fields";
import { toLocalISODate } from "@/lib/crypto/history";
import {
  createRecords,
  deleteRecords,
  getRecord,
  listRecords,
  numberCell,
  stringCell,
  updateRecords,
} from "@/lib/server/airtable";

import type { MutationResult } from "./holdings";

/**
 * Transaction logging (CLAUDE.md §5, §9b).
 *
 * §5 requires that logging an expense also moves the account balance:
 * "expense: create txn + deduct account". This does that.
 *
 * ORDERING MATTERS. Airtable has no transactions, so a two-write operation can
 * half-fail. The ledger entry is written FIRST and the balance adjusted second,
 * because a logged expense with an unadjusted balance is visible and repairable
 * — you can see the entry and re-apply it. The reverse (balance moved, no
 * entry) is money that vanished with no record of why.
 *
 * If the balance step fails, the caller is told explicitly rather than the
 * failure being swallowed.
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
  for (const tag of ["transactions", "accounts", "budget", "networth", "wealth"]) {
    revalidateTag(tag, "max");
  }
}

/**
 * Finds the Net Worth row holding an account's balance.
 *
 * Returns null when the account has no balance recorded — TymeBank is in this
 * state. Logging against it still records the transaction; there is simply no
 * balance to move, and that is surfaced rather than silently ignored.
 */
async function findBalanceRow(accountName: string) {
  const account = resolveAccount(accountName);
  if (!account?.netWorthName) return null;

  const rows = await listRecords(TABLES.netWorth, {
    fieldIds: [FIELDS.netWorth.name, FIELDS.netWorth.valueZar],
  });

  const target = account.netWorthName.toLowerCase();
  const row = rows.find(
    (r) => stringCell(r, FIELDS.netWorth.name)?.toLowerCase() === target,
  );
  if (!row) return null;

  return { recordId: row.id, current: numberCell(row, FIELDS.netWorth.valueZar) ?? 0 };
}

/** Applies a delta to an account balance. Returns the previous value for undo. */
async function adjustBalance(
  accountName: string,
  deltaZar: number,
): Promise<{ recordId: string; previous: number } | null> {
  const row = await findBalanceRow(accountName);
  if (!row) return null;

  await updateRecords(TABLES.netWorth, [
    { id: row.recordId, fields: { [FIELDS.netWorth.valueZar]: row.current + deltaZar } },
  ]);
  return { recordId: row.recordId, previous: row.current };
}

export type CreatedTransaction = {
  recordId: string;
  /** Null when the account has no recorded balance to move. */
  balanceMoved: { accountLabel: string; deltaZar: number; newBalanceZar: number } | null;
  warning: string | null;
};

export async function createTransaction(
  input: NewTransaction,
): Promise<MutationResult<CreatedTransaction>> {
  const description = input.description.trim();
  if (!description) return { ok: false, error: "Give it a description." };
  if (!Number.isFinite(input.amountZar) || input.amountZar <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }
  if (!input.category) return { ok: false, error: "Pick a category." };
  if (!input.account) return { ok: false, error: "Pick an account." };

  // Money out is stored negative, matching every existing row in the table.
  const signed =
    input.direction === "out" ? -Math.abs(input.amountZar) : Math.abs(input.amountZar);

  // Transfers and contributions move money between places you own, so the
  // *source* account still drops. Only the destination side is unhandled, and
  // that is called out rather than guessed at.
  const isMove = input.category === "Transfer" || input.category === "Crypto Swap";

  try {
    const [created] = await createRecords(TABLES.transactions, [
      {
        fields: {
          [FIELDS.transactions.description]: description,
          [FIELDS.transactions.amount]: signed,
          [FIELDS.transactions.category]: input.category,
          [FIELDS.transactions.account]: input.account,
          [FIELDS.transactions.date]: input.date || toLocalISODate(new Date()),
          [FIELDS.transactions.type]:
            input.direction === "in" ? "income" : isMove ? "transfer" : "expense",
          ...(input.notes ? { [FIELDS.transactions.notes]: input.notes } : {}),
        },
      },
    ]);

    let balanceMoved: CreatedTransaction["balanceMoved"] = null;
    let warning: string | null = null;

    try {
      const moved = await adjustBalance(input.account, signed);
      if (moved) {
        balanceMoved = {
          accountLabel: input.account,
          deltaZar: signed,
          newBalanceZar: moved.previous + signed,
        };
      } else {
        warning = `${input.account} has no balance recorded, so nothing was deducted. The entry is saved.`;
      }
    } catch (error) {
      // The ledger entry exists; only the balance step failed. Say so plainly —
      // a silent half-write is how a wealth app starts lying.
      console.error("[createTransaction] balance step failed", error);
      warning =
        "Entry saved, but the account balance could not be updated. Correct it on the Payday reset screen.";
    }

    invalidate();
    return { ok: true, data: { recordId: created.id, balanceMoved, warning } };
  } catch (error) {
    console.error("[createTransaction]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not log it.",
    };
  }
}

export type DeletedTransaction = {
  fields: Record<string, unknown>;
  /** The balance change that was reversed, so undo can re-apply it. */
  reversed: { accountName: string; deltaZar: number } | null;
};

/**
 * Deletes a transaction outright and puts the money back on the account.
 *
 * A mis-typed or duplicated entry is a mistake, not something being retired, so
 * it genuinely goes — leaving a voided husk in the ledger just moves the mess.
 * §9b's archive-don't-delete rule covers positions and accounts, not typos.
 *
 * The whole record is captured first so undo can recreate it exactly.
 */
export async function deleteTransaction(
  recordId: string,
): Promise<MutationResult<DeletedTransaction>> {
  try {
    const record = await getRecord(TABLES.transactions, recordId);
    if (!record) return { ok: false, error: "That entry no longer exists." };

    const fields = { ...(record.fields as Record<string, unknown>) };
    const amount = numberCell(record, FIELDS.transactions.amount) ?? 0;
    const accountName = stringCell(record, FIELDS.transactions.account);

    await deleteRecords(TABLES.transactions, [recordId]);

    let reversed: DeletedTransaction["reversed"] = null;
    if (accountName && amount !== 0) {
      try {
        // Deleting an expense of -R100 must put R100 back.
        const moved = await adjustBalance(accountName, -amount);
        if (moved) reversed = { accountName, deltaZar: -amount };
      } catch (error) {
        console.error("[deleteTransaction] balance reversal failed", error);
      }
    }

    invalidate();
    return { ok: true, data: { fields, reversed } };
  } catch (error) {
    console.error("[deleteTransaction]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete it.",
    };
  }
}

/** Recreates a deleted transaction and re-applies its balance effect. */
export async function restoreTransaction(
  deleted: DeletedTransaction,
): Promise<MutationResult> {
  try {
    await createRecords(TABLES.transactions, [{ fields: deleted.fields }]);
    if (deleted.reversed) {
      await adjustBalance(deleted.reversed.accountName, -deleted.reversed.deltaZar);
    }
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[restoreTransaction]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not restore it.",
    };
  }
}
