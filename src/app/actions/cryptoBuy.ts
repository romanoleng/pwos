"use server";

import { revalidateTag } from "next/cache";

import { atomic, sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Log a crypto buy as a proper event, not a hand-edited total (Romano's ask,
 * 2026-07-25). You enter what you bought — coin, quantity, rand spent, wallet —
 * and, optionally, which account you paid from. It then, in one transaction:
 *
 *   1. ADDS the quantity and cost to your existing position for that coin in
 *      that wallet (creating it if it's your first buy) — no manual maths;
 *   2. deducts the rand from the account you paid from; and
 *   3. records a dated ledger entry ("Bought N HBAR") so the money's path is
 *      visible, rather than a balance quietly changing.
 *
 * A crypto buy is a contribution (investing, not spending), so it never counts
 * as budget spend.
 */

export type CryptoBuyInput = {
  symbol: string;
  coin?: string;
  wallet: string;
  quantity: number;
  randSpent: number;
  /** Account label the cash came from. Omit to record coins only. */
  fromAccount?: string;
};

export async function logCryptoBuy(
  input: CryptoBuyInput,
): Promise<MutationResult<{ symbol: string; deducted: boolean }>> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) {
    return { ok: false, error: "Enter a coin symbol, e.g. HBAR." };
  }
  const wallet = input.wallet.trim();
  if (!wallet) return { ok: false, error: "Pick a wallet." };
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "How many coins did you buy?" };
  }
  if (!Number.isFinite(input.randSpent) || input.randSpent <= 0) {
    return { ok: false, error: "How much did you spend?" };
  }
  const coin = input.coin?.trim() || symbol;

  try {
    // Resolve the paid-from account up front so the whole write can be atomic.
    let fromId: string | null = null;
    if (input.fromAccount?.trim()) {
      const rows = await sql<{ id: string }>`
        select id from accounts where lower(label) = ${input.fromAccount.trim().toLowerCase()}
          and not archived limit 1`;
      if (rows.length === 0) return { ok: false, error: `Unknown account: ${input.fromAccount}` };
      fromId = rows[0].id;
    }

    await atomic((c) => {
      const queries = [
        // Add to the one existing holding (largest, if somehow duplicated), or
        // create it. One statement, so it's naturally atomic.
        c.query(
          `with existing as (
             update holdings set quantity = quantity + $1, invested_zar = invested_zar + $2,
                                 updated_at = now()
             where id = (select id from holdings
                         where wallet = $3 and symbol = $4 and not archived
                         order by quantity desc limit 1)
             returning id
           ),
           inserted as (
             insert into holdings (symbol, coin, wallet, quantity, invested_zar)
             select $4, $5, $3, $1, $2
             where not exists (select 1 from existing)
             returning id
           )
           select coalesce((select id from existing), (select id from inserted))::text as id`,
          [input.quantity, input.randSpent, wallet, symbol, coin],
        ),
      ];
      if (fromId) {
        queries.push(
          c.query(
            `update accounts set balance_zar = coalesce(balance_zar, 0) - $1 where id = $2`,
            [input.randSpent, fromId],
          ),
        );
        queries.push(
          c.query(
            `insert into transactions (occurred_on, description, amount_zar, type, account_id)
             values (current_date, $1, $2, 'contribution', $3)`,
            [`Bought ${input.quantity} ${symbol}`, -input.randSpent, fromId],
          ),
        );
      }
      return queries;
    });

    revalidateTag("crypto", "max");
    for (const tag of ["accounts", "networth", "wealth", "home", "transactions"]) {
      revalidateTag(tag, "max");
    }
    return { ok: true, data: { symbol, deducted: fromId !== null } };
  } catch (error) {
    console.error("[logCryptoBuy]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't log the buy." };
  }
}
