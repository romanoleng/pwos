"use server";

import { revalidateTag } from "next/cache";

import { toLocalISODate } from "@/lib/crypto/history";
import { expandSchedule, type Schedule } from "@/lib/schedule";
import { isMoveCategory } from "@/lib/transactions";
import { atomic, money, sql } from "@/lib/server/db";
import { ensureLogMeta } from "@/lib/server/logmeta";
import {
  applyDueScheduledMoves,
  consumePendingMove,
  ensureScheduleTable,
  hasPendingMove,
} from "@/lib/server/scheduled";

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
  /** Optional second level (2026-07-23). Free text; never required. */
  subcategory?: string;
  account: string;
  toAccount?: string;
  /** A kids_accounts id. Mutually exclusive with toAccount. */
  toKidAccount?: string;
  date?: string;
  notes?: string;
  confirmDuplicate?: boolean;
  /** Income that opens a new pay cycle. Explicit — never inferred (§11). */
  startsCycle?: boolean;
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
  for (const tag of ["transactions", "accounts", "budget", "networth", "wealth", "kids", "home"]) {
    revalidateTag(tag, "max");
  }
}

/**
 * Resolves a display label or alias to a canonical account id.
 *
 * The alias table is only seeded for the original accounts (the migration
 * script). An account CREATED in the app — CreativeDigital, a new card — has no
 * alias row, so alias-only lookup returned null and, as a transfer destination,
 * failed silently: the source was debited and nothing was credited, so the
 * money appeared to vanish. Falling back to the account's own label resolves
 * anything visible in the UI, alias table or not.
 */
async function accountId(name: string): Promise<string | null> {
  const clean = name.trim().toLowerCase();
  const alias = await sql<{ account_id: string }>`
    select account_id from account_aliases where alias = ${clean}`;
  if (alias[0]?.account_id) return alias[0].account_id;
  const byLabel = await sql<{ id: string }>`
    select id from accounts where lower(label) = ${clean} and not archived limit 1`;
  return byLabel[0]?.id ?? null;
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

  const subcategory = input.subcategory?.trim() || null;

  try {
    // Any scheduled entry whose date has arrived lands before this log, so
    // the balance the toast reports is never missing an overdue instalment.
    await applyDueScheduledMoves();
    // Guarantees transactions.subcategory exists before the insert names it.
    await ensureLogMeta();

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

    // Only income can open a cycle: an expense marking the start of a month
    // would make no sense, and the flag drives the whole budget period.
    const startsCycle = input.direction === "in" && input.startsCycle === true;

    const created = await sql<{ id: string }>`
      insert into transactions
        (occurred_on, description, amount_zar, type, category, subcategory, account_id,
         to_account_id, to_kid_account_id, notes, starts_cycle)
      values (${occurredOn}::date, ${description}, ${signed}, ${type}::transaction_type,
              ${input.category}, ${subcategory}, ${from}, ${to}, ${toKid}::bigint,
              ${input.notes || null}, ${startsCycle})
      returning id::text`;

    // A new subcategory joins the vocabulary the moment it's first used, so
    // its chip exists next time without a management step.
    if (subcategory) {
      await sql`
        insert into subcategories (category, name)
        select ${input.category}, ${subcategory}
        where exists (select 1 from categories where name = ${input.category})
        on conflict do nothing`;
    }

    if (startsCycle) {
      // Idempotent: logging a second payment on the same day must not create a
      // second cycle, and re-anchoring an existing day is a no-op.
      await sql`
        insert into cycle_anchors (started_on, transaction_id, note)
        values (${occurredOn}::date, ${created[0].id}::bigint, ${"Logged with income"})
        on conflict (started_on) do nothing`;
    }

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
      // No `balance_zar is not null` guard here, unlike the source: money
      // arriving is always a known amount, so a destination with no recorded
      // balance is initialised from zero rather than left untouched. Without
      // this a transfer into an unreconciled account (a new business account
      // never given an opening balance) credited nothing and the transfer
      // looked like a loss. The toast reports the new balance so the
      // assumption is visible and easy to correct.
      const received = await sql<{ label: string; balance_zar: string | null }>`
        update accounts set balance_zar = coalesce(balance_zar, 0) + ${Math.abs(input.amountZar)}
        where id = ${to}
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

export type CreatedSeries = {
  recordIds: string[];
  count: number;
  firstDate: string;
  lastDate: string;
  /** The recurring figure: the monthly amount, or the standard instalment. */
  monthlyZar: number;
  balanceMoved: CreatedTransaction["balanceMoved"];
  warning: string | null;
};

/**
 * Repeat / instalment logging (the Rep/Inst. pattern, 2026-07-22).
 *
 * One submission becomes N monthly entries in a single database transaction —
 * all land or none do. Entries dated today move the balance now; future ones
 * queue their delta in pending_balance_moves and the sweep applies each when
 * its date arrives. Transfers are excluded: a repeating transfer needs both
 * legs scheduled, which is V1.1 territory.
 */
export async function createTransactionSeries(
  input: Omit<NewTransaction, "confirmDuplicate" | "toAccount" | "toKidAccount" | "startsCycle"> & {
    schedule: Schedule;
  },
): Promise<MutationResult<CreatedSeries>> {
  const description = input.description.trim();
  if (!description) return { ok: false, error: "Give it a description." };
  if (!Number.isFinite(input.amountZar) || input.amountZar <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }
  if (!input.category) return { ok: false, error: "Pick a category." };
  if (isMoveCategory(input.category)) {
    return { ok: false, error: "Repeats and instalments can't be transfers yet." };
  }
  if (!input.account) return { ok: false, error: "Pick an account." };

  const subcategory = input.subcategory?.trim() || null;

  try {
    await ensureLogMeta();
    const from = await accountId(input.account);
    if (!from) return { ok: false, error: `Unknown account: ${input.account}` };

    const todayIso = toLocalISODate(new Date());
    const startDate = input.date || todayIso;
    const entries = expandSchedule({
      schedule: input.schedule,
      startDate,
      amountZar: input.amountZar,
      description,
    });

    const sign = input.direction === "out" ? -1 : 1;
    const type = input.direction === "in" ? "income" : "expense";
    const dueNowTotal = entries
      .filter((e) => e.date <= todayIso)
      .reduce((total, e) => total + sign * e.amountZar, 0);

    if (entries.some((e) => e.date > todayIso)) await ensureScheduleTable();

    // One batch, one transaction: every entry, every queue row, and the
    // balance move for anything already due — or nothing at all.
    const results = await atomic<{ id?: string; label?: string; balance_zar?: string | null }>(
      (lazy) => {
        const queries = entries.map((entry) => {
          const signed = sign * entry.amountZar;
          if (entry.date <= todayIso) {
            return lazy`
              insert into transactions
                (occurred_on, description, amount_zar, type, category, subcategory, account_id, notes, starts_cycle)
              values (${entry.date}::date, ${entry.description}, ${signed},
                      ${type}::transaction_type, ${input.category}, ${subcategory}, ${from},
                      ${input.notes || null}, false)
              returning id::text`;
          }
          // Future entry: ledger row + queued balance move, atomically paired.
          return lazy`
            with t as (
              insert into transactions
                (occurred_on, description, amount_zar, type, category, subcategory, account_id, notes, starts_cycle)
              values (${entry.date}::date, ${entry.description}, ${signed},
                      ${type}::transaction_type, ${input.category}, ${subcategory}, ${from},
                      ${input.notes || null}, false)
              returning id
            )
            insert into pending_balance_moves (transaction_id, account_id, delta_zar, apply_on)
            select id, ${from}::text, ${signed}, ${entry.date}::date from t
            returning transaction_id::text as id`;
        });
        if (dueNowTotal !== 0) {
          queries.push(lazy`
            update accounts set balance_zar = coalesce(balance_zar, 0) + ${dueNowTotal}
            where id = ${from} and balance_zar is not null
            returning label, balance_zar`);
        }
        return queries;
      },
    );

    const recordIds = results
      .slice(0, entries.length)
      .map((rows) => rows[0]?.id)
      .filter((id): id is string => typeof id === "string");
    const moved = dueNowTotal !== 0 ? results[entries.length]?.[0] : undefined;

    invalidate();
    return {
      ok: true,
      data: {
        recordIds,
        count: entries.length,
        firstDate: entries[0].date,
        lastDate: entries[entries.length - 1].date,
        // For instalments the first absorbs the rounding remainder, so the
        // figure worth reporting is the standard one.
        monthlyZar: entries[entries.length - 1].amountZar,
        balanceMoved:
          moved?.label !== undefined
            ? {
                accountLabel: moved.label,
                deltaZar: dueNowTotal,
                newBalanceZar: money(moved.balance_zar),
              }
            : null,
        warning:
          dueNowTotal !== 0 && moved?.label === undefined
            ? `${input.account} has no balance recorded, so nothing was deducted. The entries are saved.`
            : null,
      },
    };
  } catch (error) {
    console.error("[createTransactionSeries]", error);
    const message = error instanceof Error ? error.message : "Could not log the series.";
    if (message.includes("transactions_no_exact_duplicate")) {
      return { ok: false, error: "One of the entries would duplicate an existing one — nothing was logged." };
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
    // A scheduled entry whose date hasn't arrived never moved the balance, so
    // deleting it must not "refund" anything. Consume the queue row first —
    // its existence is the proof either way.
    const neverApplied = await consumePendingMove(recordId);

    await ensureLogMeta();
    const rows = await sql<Record<string, unknown>>`
      delete from transactions where id = ${recordId}::bigint
      returning occurred_on::text, description, amount_zar, type::text,
                category, subcategory, original_category, account_id, to_account_id,
                to_kid_account_id::text, notes, starts_cycle`;
    if (rows.length === 0) return { ok: false, error: "That entry no longer exists." };

    const row = rows[0];
    const amount = money(row.amount_zar);
    const from = row.account_id as string | null;

    // Deleting an expense of -R100 puts R100 back.
    if (from && !neverApplied) {
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
    // The cycle it opened goes with it, or the budget period would point at a
    // payment that no longer exists.
    if (row.starts_cycle) {
      await sql`delete from cycle_anchors
                where started_on = ${String(row.occurred_on).slice(0, 10)}::date`;
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
    await ensureLogMeta();
    const occurredOn = String(f.occurred_on).slice(0, 10);
    const created = await sql<{ id: string }>`
      insert into transactions
        (occurred_on, description, amount_zar, type, category, subcategory, original_category,
         account_id, to_account_id, to_kid_account_id, notes, starts_cycle)
      values (${occurredOn}::date, ${f.description as string},
              ${money(f.amount_zar)}, ${f.type as string}::transaction_type,
              ${(f.category as string) ?? null}, ${(f.subcategory as string) ?? null},
              ${(f.original_category as string) ?? null},
              ${(f.account_id as string) ?? null}, ${(f.to_account_id as string) ?? null},
              ${(f.to_kid_account_id as string) ?? null}::bigint,
              ${(f.notes as string) ?? null}, ${f.starts_cycle === true})
      returning id::text`;
    // Restoring a still-future entry re-queues its move instead of applying
    // it early — the same rule as logging it in the first place.
    const stillFuture = occurredOn > toLocalISODate(new Date());
    if (f.account_id && stillFuture) {
      await ensureScheduleTable();
      await sql`insert into pending_balance_moves (transaction_id, account_id, delta_zar, apply_on)
                values (${created[0].id}::bigint, ${f.account_id as string}::text,
                        ${money(f.amount_zar)}, ${occurredOn}::date)
                on conflict (transaction_id) do nothing`;
    } else if (f.account_id) {
      await sql`update accounts set balance_zar = coalesce(balance_zar, 0) + ${money(f.amount_zar)}
                where id = ${f.account_id as string} and balance_zar is not null`;
    }
    if (f.to_kid_account_id) {
      await sql`update kids_accounts set balance_zar = balance_zar + ${Math.abs(money(f.amount_zar))}
                where id = ${f.to_kid_account_id as string}::bigint`;
    }
    if (f.starts_cycle === true) {
      await sql`insert into cycle_anchors (started_on, note)
                values (${String(f.occurred_on).slice(0, 10)}::date, ${"Restored with income"})
                on conflict (started_on) do nothing`;
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
  /** Optional second level. Absent = keep; empty string = clear. */
  subcategory?: string;
};

export async function updateTransaction(
  recordId: string,
  edit: TransactionEdit,
): Promise<MutationResult<{ warning: string | null }>> {
  try {
    const existing = await sql<{
      amount_zar: string;
      account_id: string | null;
      to_account_id: string | null;
      to_kid_account_id: string | null;
      type: string;
      occurred_on: string;
    }>`
      select amount_zar, account_id, to_account_id, to_kid_account_id::text,
             type::text, occurred_on::text
      from transactions where id = ${recordId}::bigint`;
    if (existing.length === 0) return { ok: false, error: "That entry no longer exists." };

    // A scheduled entry's balance move is still queued — editing it edits the
    // queue row, and the balance arithmetic below must not run at all.
    const pending = await hasPendingMove(recordId);

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

    // Sent means decided: an empty value clears the tag, absence keeps it.
    if (edit.subcategory !== undefined) {
      await ensureLogMeta();
      const nextSubcategory = edit.subcategory.trim() || null;
      await sql`update transactions set subcategory = ${nextSubcategory}
                where id = ${recordId}::bigint`;
      if (nextSubcategory && edit.category) {
        await sql`
          insert into subcategories (category, name)
          select ${edit.category}, ${nextSubcategory}
          where exists (select 1 from categories where name = ${edit.category})
          on conflict do nothing`;
      }
    }

    if (pending) {
      // Keep the queued move in step with the edit; the sweep applies it when
      // the (possibly new) date arrives. No stored balance changes today.
      await sql`
        update pending_balance_moves set
          delta_zar  = ${newAmount},
          account_id = ${newAccount ?? ""}::text,
          apply_on   = coalesce(${edit.date || null}::date,
                                ${String(existing[0].occurred_on).slice(0, 10)}::date)
        where transaction_id = ${recordId}::bigint`;
      invalidate();
      return { ok: true, data: { warning: null } };
    }

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

    // A transfer's OTHER leg. Editing the amount of a transfer used to move
    // only the source, leaving the destination on the old figure — both sides
    // of the same move disagreeing. The destination was credited abs(oldAmount)
    // and should now hold abs(newAmount), so shift it by the difference.
    // (Transfers are never scheduled, so this is unreachable in the pending
    // branch above.) The destination and its target can't be changed while
    // editing, only the amount, so the ids are the ones already stored.
    const destDelta = Math.abs(newAmount) - Math.abs(oldAmount);
    if (destDelta !== 0) {
      if (existing[0].to_account_id) {
        await sql`update accounts set balance_zar = coalesce(balance_zar,0) + ${destDelta}
                  where id = ${existing[0].to_account_id} and balance_zar is not null`;
      }
      if (existing[0].to_kid_account_id) {
        await sql`update kids_accounts set balance_zar = balance_zar + ${destDelta}
                  where id = ${existing[0].to_kid_account_id}::bigint`;
      }
    }

    invalidate();
    return { ok: true, data: { warning: null } };
  } catch (error) {
    console.error("[updateTransaction]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not update it." };
  }
}
