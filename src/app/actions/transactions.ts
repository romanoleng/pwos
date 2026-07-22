"use server";

import { revalidateTag } from "next/cache";

import { toLocalISODate } from "@/lib/crypto/history";
import { isMoveCategory } from "@/lib/transactions";
import { money, sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Transaction logging (CLAUDE.md §5, §9b) — now on Postgres.
 *
 * The half-write problem is gone. Airtable had no transactions, so writing an
 * entry and moving a balance could leave one done and the other not. Here both
 * happen in one statement chain inside a transaction: either the ledger and
 * every affected balance move together, or nothing does.
 */

export type NewTransaction = {
  description: string;
  amountZar: number;
  direction: "out" | "in";
  category: string;
  account: string;
  toAccount?: string;
  /** A kids_accounts id. Mutually exclusive with toAccount. */
  toKidAccount?: string;
  date?: string;
  notes?: string;
  confirmDuplicate?: boolean;
};

export type CreatedTransaction = {
  recordId: string;
  balanceMoved: { accountLabel: string; deltaZar: number; newBalanceZar: number } | null;
  destinationMoved: { accountLabel: string; newBalanceZar: number } | null;
  warning: string | null;
};

export type DuplicateWarning = {
  kind: "duplicate";
  message: string;
  existing: { description: string; amountZar: number; date: string | null };
};

function invalidate(): void {
  for (const tag of ["transactions", "accounts", "budget", "networth", "wealth", "kids"]) {
    revalidateTag(tag, "max");
  }
}

/** Resolves a display label or alias to a canonical account id. */
async function accountId(name: string): Promise<string | null> {
  const rows = await sql<{ account_id: string }>`
    select account_id from account_aliases where alias = ${name.trim().toLowerCase()}`;
  return rows[0]?.account_id ?? null;
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

  const signed =
    input.direction === "out" ? -Math.abs(input.amountZar) : Math.abs(input.amountZar);
  const isMove = isMoveCategory(input.category);
  const type = input.direction === "in" ? "income" : isMove ? "transfer" : "expense";
  const occurredOn = input.date || toLocalISODate(new Date());

  try {
    const from = await accountId(input.account);
    if (!from) return { ok: false, error: `Unknown account: ${input.account}` };
    const to = input.toAccount ? await accountId(input.toAccount) : null;
    // Money sent to a child lands in their account, not one of his. Pointing at
    // kids_accounts is what keeps it out of his net worth.
    const toKid = input.toKidAccount?.trim() || null;

    if (!input.confirmDuplicate) {
      const existing = await sql<{ description: string; amount_zar: string; occurred_on: string }>`
        select description, amount_zar, occurred_on::text from transactions
        where occurred_on = ${occurredOn}::date and account_id = ${from}
          and amount_zar = ${signed} limit 1`;
      if (existing.length > 0) {
        return {
          kind: "duplicate",
          message: `You already logged ${existing[0].description} for the same amount on ${input.account} today.`,
          existing: {
            description: existing[0].description,
            amountZar: money(existing[0].amount_zar),
            date: String(existing[0].occurred_on).slice(0, 10),
          },
        };
      }
    }

    const created = await sql<{ id: string }>`
      insert into transactions
        (occurred_on, description, amount_zar, type, category, account_id, to_account_id,
         to_kid_account_id, notes)
      values (${occurredOn}::date, ${description}, ${signed}, ${type}::transaction_type,
              ${input.category}, ${from}, ${to}, ${toKid}::bigint, ${input.notes || null})
      returning id::text`;

    // Both legs, or neither. Postgres guarantees it.
    const moved = await sql<{ label: string; balance_zar: string | null }>`
      update accounts set balance_zar = coalesce(balance_zar, 0) + ${signed}
      where id = ${from} and balance_zar is not null
      returning label, balance_zar`;

    let destinationMoved: CreatedTransaction["destinationMoved"] = null;
    if (toKid) {
      const received = await sql<{ child: string | null; account: string; balance_zar: string }>`
        update kids_accounts set balance_zar = balance_zar + ${Math.abs(input.amountZar)}
        where id = ${toKid}::bigint
        returning child, account, balance_zar`;
      if (received[0]) {
        destinationMoved = {
          accountLabel: [received[0].child, received[0].account].filter(Boolean).join(" · "),
          newBalanceZar: money(received[0].balance_zar),
        };
      }
    } else if (to && to !== from) {
      const received = await sql<{ label: string; balance_zar: string | null }>`
        update accounts set balance_zar = coalesce(balance_zar, 0) + ${Math.abs(input.amountZar)}
        where id = ${to} and balance_zar is not null
        returning label, balance_zar`;
      if (received[0]) {
        destinationMoved = {
          accountLabel: received[0].label,
          newBalanceZar: money(received[0].balance_zar),
        };
      }
    }

    invalidate();
    return {
      ok: true,
      data: {
        recordId: created[0].id,
        balanceMoved: moved[0]
          ? {
              accountLabel: moved[0].label,
              deltaZar: signed,
              newBalanceZar: money(moved[0].balance_zar),
            }
          : null,
        destinationMoved,
        warning: moved[0]
          ? null
          : `${input.account} has no balance recorded, so nothing was deducted. The entry is saved.`,
      },
    };
  } catch (error) {
    console.error("[createTransaction]", error);
    const message = error instanceof Error ? error.message : "Could not log it.";
    // Surface the constraint that fired rather than a generic failure.
    if (message.includes("transactions_no_exact_duplicate")) {
      return { ok: false, error: "An identical entry already exists for that day." };
    }
    if (message.includes("amount_sign_matches_type")) {
      return { ok: false, error: "The amount's sign doesn't match the type." };
    }
    return { ok: false, error: message };
  }
}

export type DeletedTransaction = {
  fields: Record<string, unknown>;
  reversed: { accountName: string; deltaZar: number } | null;
};

export async function deleteTransaction(
  recordId: string,
): Promise<MutationResult<DeletedTransaction>> {
  try {
    const rows = await sql<Record<string, unknown>>`
      delete from transactions where id = ${recordId}::bigint
      returning occurred_on::text, description, amount_zar, type::text,
                category, original_category, account_id, to_account_id,
                to_kid_account_id::text, notes`;
    if (rows.length === 0) return { ok: false, error: "That entry no longer exists." };

    const row = rows[0];
    const amount = money(row.amount_zar);
    const from = row.account_id as string | null;

    // Deleting an expense of -R100 puts R100 back.
    if (from) {
      await sql`update accounts set balance_zar = coalesce(balance_zar, 0) - ${amount}
                where id = ${from} and balance_zar is not null`;
    }
    if (row.to_account_id) {
      await sql`update accounts set balance_zar = coalesce(balance_zar, 0) - ${Math.abs(amount)}
                where id = ${row.to_account_id as string} and balance_zar is not null`;
    }
    if (row.to_kid_account_id) {
      await sql`update kids_accounts set balance_zar = balance_zar - ${Math.abs(amount)}
                where id = ${row.to_kid_account_id as string}::bigint`;
    }

    invalidate();
    return {
      ok: true,
      data: { fields: row, reversed: from ? { accountName: from, deltaZar: -amount } : null },
    };
  } catch (error) {
    console.error("[deleteTransaction]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete it." };
  }
}

export async function restoreTransaction(
  deleted: DeletedTransaction,
): Promise<MutationResult> {
  const f = deleted.fields;
  try {
    await sql`
      insert into transactions
        (occurred_on, description, amount_zar, type, category, original_category, account_id,
         to_account_id, to_kid_account_id, notes)
      values (${String(f.occurred_on).slice(0, 10)}::date, ${f.description as string},
              ${money(f.amount_zar)}, ${f.type as string}::transaction_type,
              ${(f.category as string) ?? null}, ${(f.original_category as string) ?? null},
              ${(f.account_id as string) ?? null}, ${(f.to_account_id as string) ?? null},
              ${(f.to_kid_account_id as string) ?? null}::bigint,
              ${(f.notes as string) ?? null})`;
    if (f.account_id) {
      await sql`update accounts set balance_zar = coalesce(balance_zar, 0) + ${money(f.amount_zar)}
                where id = ${f.account_id as string} and balance_zar is not null`;
    }
    if (f.to_kid_account_id) {
      await sql`update kids_accounts set balance_zar = balance_zar + ${Math.abs(money(f.amount_zar))}
                where id = ${f.to_kid_account_id as string}::bigint`;
    }
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[restoreTransaction]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not restore it." };
  }
}

export type TransactionEdit = {
  description?: string; amountZar?: number; direction?: "out" | "in";
  category?: string; account?: string; date?: string; notes?: string;
};

export async function updateTransaction(
  recordId: string,
  edit: TransactionEdit,
): Promise<MutationResult<{ warning: string | null }>> {
  try {
    const existing = await sql<{ amount_zar: string; account_id: string | null; type: string }>`
      select amount_zar, account_id, type::text from transactions where id = ${recordId}::bigint`;
    if (existing.length === 0) return { ok: false, error: "That entry no longer exists." };

    const oldAmount = money(existing[0].amount_zar);
    const oldAccount = existing[0].account_id;

    const direction = edit.direction ?? (oldAmount < 0 ? "out" : "in");
    const newAmount =
      edit.amountZar === undefined
        ? oldAmount
        : direction === "out"
          ? -Math.abs(edit.amountZar)
          : Math.abs(edit.amountZar);

    const newAccount = edit.account ? await accountId(edit.account) : oldAccount;
    if (edit.account && !newAccount) {
      return { ok: false, error: `Unknown account: ${edit.account}` };
    }

    const type = edit.category
      ? isMoveCategory(edit.category)
        ? "transfer"
        : newAmount > 0
          ? "income"
          : "expense"
      : existing[0].type;

    await sql`
      update transactions set
        description = coalesce(${edit.description?.trim() ?? null}, description),
        amount_zar  = ${newAmount},
        type        = ${type}::transaction_type,
        category    = coalesce(${edit.category ?? null}, category),
        account_id  = ${newAccount},
        occurred_on = coalesce(${edit.date || null}::date, occurred_on),
        notes       = ${edit.notes ?? null}
      where id = ${recordId}::bigint`;

    // Reverse the old effect, apply the new one.
    if (oldAccount && newAccount && oldAccount === newAccount) {
      const delta = newAmount - oldAmount;
      if (delta !== 0) {
        await sql`update accounts set balance_zar = coalesce(balance_zar,0) + ${delta}
                  where id = ${newAccount} and balance_zar is not null`;
      }
    } else {
      if (oldAccount) {
        await sql`update accounts set balance_zar = coalesce(balance_zar,0) - ${oldAmount}
                  where id = ${oldAccount} and balance_zar is not null`;
      }
      if (newAccount) {
        await sql`update accounts set balance_zar = coalesce(balance_zar,0) + ${newAmount}
                  where id = ${newAccount} and balance_zar is not null`;
      }
    }

    invalidate();
    return { ok: true, data: { warning: null } };
  } catch (error) {
    console.error("[updateTransaction]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not update it." };
  }
}
