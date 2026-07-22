"use server";

import { revalidateTag } from "next/cache";

import { sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Fresh start (build report — "complete reset").
 *
 * Makes the app feel newly installed from a chosen date without destroying
 * anything. Romano is under debt review: that ledger is his only record of
 * what he has actually paid Anders, MBD and SCM, so deleting it would leave
 * him unable to answer a creditor. Everything older than the cutover is hidden
 * from every screen and stays in the database behind a switch in Settings.
 *
 * What it does NOT touch, deliberately:
 *   - categories, accounts, debts, goals, kids' accounts (the structure)
 *   - crypto holdings and cost basis (positions, not history)
 *   - the audit trail
 */

const KEEP_BALANCE = ["capitec-main", "gotyme"];

function invalidate(): void {
  for (const tag of [
    "transactions", "budget", "home", "accounts", "networth",
    "wealth", "goals", "kids", "stats",
  ]) {
    revalidateTag(tag, "max");
  }
}

export type FreshStartResult = {
  cutoverDate: string;
  hiddenTransactions: number;
  hiddenBudgetLines: number;
  balancesCleared: number;
  balancesKept: string[];
};

export async function runFreshStart(
  cutoverDate: string,
): Promise<MutationResult<FreshStartResult>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate)) {
    return { ok: false, error: "That date doesn't look right." };
  }

  try {
    const [hidden] = await sql<{ txns: string; lines: string }>`
      select
        (select count(*)::text from transactions where occurred_on < ${cutoverDate}::date) as txns,
        (select count(*)::text from budgets      where cycle_start < ${cutoverDate}::date) as lines`;

    // Balances are set to NULL, not 0. NULL means "not recorded yet" and the
    // app says so; 0 would claim the account is genuinely empty, which is the
    // confident-but-wrong figure this app exists to avoid.
    const cleared = await sql<{ id: string }>`
      update accounts set balance_zar = null
      where not archived and balance_zar is not null
        and id <> all(${KEEP_BALANCE})
      returning id`;

    await sql`
      update app_settings
      set cutover_date = ${cutoverDate}::date, show_history = false, updated_at = now()
      where id = true`;

    invalidate();
    return {
      ok: true,
      data: {
        cutoverDate,
        hiddenTransactions: Number(hidden.txns),
        hiddenBudgetLines: Number(hidden.lines),
        balancesCleared: cleared.length,
        balancesKept: KEEP_BALANCE,
      },
    };
  } catch (error) {
    console.error("[runFreshStart]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reset." };
  }
}

/** Undo the reset entirely — the history was never deleted. */
export async function undoFreshStart(): Promise<MutationResult> {
  try {
    await sql`
      update app_settings
      set cutover_date = null, show_history = false, updated_at = now()
      where id = true`;
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[undoFreshStart]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't undo it." };
  }
}

/** Show or hide everything from before the reset, without changing the date. */
export async function setShowHistory(show: boolean): Promise<MutationResult> {
  try {
    await sql`update app_settings set show_history = ${show}, updated_at = now() where id = true`;
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[setShowHistory]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't change it." };
  }
}
