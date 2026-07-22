import "server-only";

import { sql } from "./db";

/**
 * Deferred balance moves for scheduled entries (repeat / instalment series).
 *
 * A future-dated entry must NOT move an account balance the day it is logged —
 * logging a year of rent would empty the account today. Instead each future
 * entry queues its delta here, and the sweep applies everything whose date has
 * arrived. Exactly-once by construction: the sweep is a single statement whose
 * CTE deletes the queue rows and applies their sum in the same transaction.
 *
 * The table is provisioned lazily by the first series ever created
 * (create table if not exists — idempotent), so no out-of-band migration is
 * needed and every read path tolerates its absence.
 */

export async function ensureScheduleTable(): Promise<void> {
  await sql`
    create table if not exists pending_balance_moves (
      transaction_id bigint primary key references transactions(id) on delete cascade,
      account_id text not null,
      delta_zar numeric(14, 2) not null,
      apply_on date not null
    )`;
}

/** True when the error is just "the queue table hasn't been created yet". */
export function isMissingScheduleTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("pending_balance_moves") &&
    (message.includes("does not exist") || message.includes("42P01"))
  );
}

/**
 * Apply every queued move whose date has arrived (SAST, not UTC — the same
 * midnight trap as everywhere else). Called from the most-travelled paths
 * (home load, logging), so a scheduled entry lands the first time the app is
 * opened on or after its date.
 *
 * Accounts with no recorded balance keep the createTransaction semantics:
 * nothing to move, the entry itself still stands.
 */
export async function applyDueScheduledMoves(): Promise<void> {
  try {
    await sql`
      with due as (
        delete from pending_balance_moves
        where apply_on <= (now() at time zone 'Africa/Johannesburg')::date
        returning account_id, delta_zar
      ),
      sums as (
        select account_id, sum(delta_zar) as delta from due group by account_id
      )
      update accounts a
      set balance_zar = coalesce(a.balance_zar, 0) + sums.delta
      from sums
      where a.id::text = sums.account_id and a.balance_zar is not null`;
  } catch (error) {
    if (isMissingScheduleTable(error)) return; // no series ever created
    console.error("[applyDueScheduledMoves]", error);
  }
}

/**
 * Remove an entry's queued move, reporting whether one existed. Deleting a
 * scheduled entry whose balance never moved must not "refund" the account —
 * the caller skips its reversal when this returns true.
 */
export async function consumePendingMove(transactionId: string): Promise<boolean> {
  try {
    const rows = await sql<{ one: number }>`
      delete from pending_balance_moves
      where transaction_id = ${transactionId}::bigint
      returning 1 as one`;
    return rows.length > 0;
  } catch (error) {
    if (isMissingScheduleTable(error)) return false;
    throw error;
  }
}

/** Whether an entry's balance move is still queued (i.e. never applied). */
export async function hasPendingMove(transactionId: string): Promise<boolean> {
  try {
    const rows = await sql<{ one: number }>`
      select 1 as one from pending_balance_moves
      where transaction_id = ${transactionId}::bigint`;
    return rows.length > 0;
  } catch (error) {
    if (isMissingScheduleTable(error)) return false;
    throw error;
  }
}
