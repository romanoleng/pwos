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
 *   - account balances. A balance is current reality, not history — a savings
 *     pot doesn't empty because a new budget cycle began. It once nulled every
 *     non-spendable balance, which would wipe the Capitec/GOtyme savings pots
 *     Romano maintains by hand; removed 2026-07-24 so a reset keeps them.
 */

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
  /** What was cleared, so the undo toast can genuinely put it back. */
  clearedBalances: { id: string; balanceZar: number }[];
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

    // Balances are kept as-is (see the header note): a reset hides history, it
    // doesn't empty your accounts. Nothing is cleared, so there is nothing for
    // the undo to restore beyond the cutover date itself.
    const cleared: { id: string; balance_zar: string }[] = [];

    const kept = await sql<{ label: string }>`
      select label from accounts where not archived and balance_zar is not null order by label`;

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
        balancesKept: kept.map((row) => row.label),
        clearedBalances: cleared.map((row) => ({
          id: row.id,
          balanceZar: Number.parseFloat(row.balance_zar),
        })),
      },
    };
  } catch (error) {
    console.error("[runFreshStart]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reset." };
  }
}

/**
 * Undo the reset entirely — the history was never deleted, and the balances
 * the reset cleared are put back when the caller still holds them (the undo
 * toast does; the later "Cancel the reset" button doesn't, and says less).
 */
export async function undoFreshStart(
  clearedBalances?: { id: string; balanceZar: number }[],
): Promise<MutationResult> {
  try {
    await sql`
      update app_settings
      set cutover_date = null, show_history = false, updated_at = now()
      where id = true`;
    for (const cleared of clearedBalances ?? []) {
      // Only fill the gap the reset made — never overwrite a figure typed
      // since, which would replace new truth with old.
      await sql`
        update accounts set balance_zar = ${cleared.balanceZar}
        where id = ${cleared.id} and balance_zar is null`;
    }
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
