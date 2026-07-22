"use server";

import { revalidateTag } from "next/cache";

import { resolveAccount } from "@/lib/accounts";
import { FIELDS, TABLES } from "@/lib/airtable-fields";
import { toLocalISODate } from "@/lib/crypto/history";
import { isMoveCategory } from "@/lib/transactions";
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
  /**
   * Destination for a transfer or contribution. §5 requires both legs to move:
   * without it, money leaves one account and arrives nowhere.
   */
  toAccount?: string;
  /** ISO yyyy-mm-dd. Defaults to today in Africa/Johannesburg. */
  date?: string;
  notes?: string;
  /** Set once the user has seen and dismissed a duplicate warning. */
  confirmDuplicate?: boolean;
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
  /** The receiving side of a transfer, when there is one. */
  destinationMoved: { accountLabel: string; newBalanceZar: number } | null;
  warning: string | null;
};

export type DuplicateWarning = {
  kind: "duplicate";
  message: string;
  existing: { description: string; amountZar: number; date: string | null };
};

/**
 * Looks for an entry that already matches this one — same account, same amount,
 * same day. Romano logged the same expense twice within a minute; catching it
 * at the point of entry is far cheaper than finding it in a budget later.
 *
 * It warns rather than blocks: two identical coffees on one day is a real
 * thing, and an app that refuses to record reality is worse than one that asks.
 */
async function findLikelyDuplicate(input: NewTransaction, signedAmount: number) {
  const date = input.date || toLocalISODate(new Date());
  const rows = await listRecords(TABLES.transactions, {
    fieldIds: [
      FIELDS.transactions.description,
      FIELDS.transactions.amount,
      FIELDS.transactions.account,
      FIELDS.transactions.date,
    ],
  });

  const match = rows.find((row) => {
    const rowDate = stringCell(row, FIELDS.transactions.date)?.slice(0, 10);
    if (rowDate !== date) return false;
    if (stringCell(row, FIELDS.transactions.account) !== input.account) return false;
    const amount = numberCell(row, FIELDS.transactions.amount) ?? 0;
    return Math.abs(amount - signedAmount) < 0.005;
  });

  if (!match) return null;
  return {
    description: stringCell(match, FIELDS.transactions.description) ?? "—",
    amountZar: numberCell(match, FIELDS.transactions.amount) ?? 0,
    date: stringCell(match, FIELDS.transactions.date),
  };
}

export async function createTransaction(
  input: NewTransaction,
): Promise<MutationResult<CreatedTransaction> | DuplicateWarning> {
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

  const isMove = isMoveCategory(input.category);

  try {
    if (!input.confirmDuplicate) {
      const existing = await findLikelyDuplicate(input, signed);
      if (existing) {
        return {
          kind: "duplicate",
          message: `You already logged ${existing.description} for the same amount on ${input.account} today.`,
          existing,
        };
      }
    }

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
    let destinationMoved: CreatedTransaction["destinationMoved"] = null;
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

      // §5: a transfer moves between accounts. Without this leg the money
      // leaves the source and arrives nowhere, which quietly destroys net worth.
      if (isMove && input.toAccount && input.toAccount !== input.account) {
        const received = await adjustBalance(input.toAccount, Math.abs(input.amountZar));
        if (received) {
          destinationMoved = {
            accountLabel: input.toAccount,
            newBalanceZar: received.previous + Math.abs(input.amountZar),
          };
        } else {
          warning = `${input.toAccount} has no balance recorded, so the receiving side wasn't credited.`;
        }
      }
    } catch (error) {
      // The ledger entry exists; only the balance step failed. Say so plainly —
      // a silent half-write is how a wealth app starts lying.
      console.error("[createTransaction] balance step failed", error);
      warning =
        "Entry saved, but the account balance could not be updated. Correct it on the Payday reset screen.";
    }

    invalidate();
    return {
      ok: true,
      data: { recordId: created.id, balanceMoved, destinationMoved, warning },
    };
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

export type TransactionEdit = {
  description?: string;
  amountZar?: number;
  direction?: "out" | "in";
  category?: string;
  account?: string;
  date?: string;
  notes?: string;
};

/**
 * Edits an existing entry and keeps balances honest.
 *
 * The balance effect of the old version is reversed and the new one applied,
 * so changing an amount or moving an entry to a different account leaves both
 * accounts correct. Editing without this would silently desync every balance
 * the entry ever touched.
 */
export async function updateTransaction(
  recordId: string,
  edit: TransactionEdit,
): Promise<MutationResult<{ warning: string | null }>> {
  try {
    const record = await getRecord(TABLES.transactions, recordId);
    if (!record) return { ok: false, error: "That entry no longer exists." };

    const oldAmount = numberCell(record, FIELDS.transactions.amount) ?? 0;
    const oldAccount = stringCell(record, FIELDS.transactions.account);

    const fields: Record<string, unknown> = {};
    if (edit.description !== undefined) {
      const trimmed = edit.description.trim();
      if (!trimmed) return { ok: false, error: "Give it a description." };
      fields[FIELDS.transactions.description] = trimmed;
    }
    if (edit.category) fields[FIELDS.transactions.category] = edit.category;
    if (edit.account) fields[FIELDS.transactions.account] = edit.account;
    if (edit.date) fields[FIELDS.transactions.date] = edit.date;
    if (edit.notes !== undefined) fields[FIELDS.transactions.notes] = edit.notes;

    let newAmount = oldAmount;
    if (edit.amountZar !== undefined) {
      if (!Number.isFinite(edit.amountZar) || edit.amountZar <= 0) {
        return { ok: false, error: "Amount must be greater than zero." };
      }
      const direction = edit.direction ?? (oldAmount < 0 ? "out" : "in");
      newAmount = direction === "out" ? -Math.abs(edit.amountZar) : Math.abs(edit.amountZar);
      fields[FIELDS.transactions.amount] = newAmount;
    }
    if (edit.category) {
      fields[FIELDS.transactions.type] = isMoveCategory(edit.category)
        ? "transfer"
        : newAmount > 0
          ? "income"
          : "expense";
    }

    if (Object.keys(fields).length === 0) return { ok: false, error: "Nothing to change." };

    await updateRecords(TABLES.transactions, [{ id: recordId, fields }]);

    let warning: string | null = null;
    try {
      const newAccount = edit.account ?? oldAccount;
      if (oldAccount && newAccount && oldAccount === newAccount) {
        // Same account: apply only the difference.
        const delta = newAmount - oldAmount;
        if (delta !== 0) await adjustBalance(newAccount, delta);
      } else {
        if (oldAccount) await adjustBalance(oldAccount, -oldAmount);
        if (newAccount) await adjustBalance(newAccount, newAmount);
      }
    } catch (error) {
      console.error("[updateTransaction] balance step failed", error);
      warning = "Entry updated, but balances could not be adjusted. Check the Payday reset screen.";
    }

    invalidate();
    return { ok: true, data: { warning } };
  } catch (error) {
    console.error("[updateTransaction]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update it.",
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
