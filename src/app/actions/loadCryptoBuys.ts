"use server";

import { revalidateTag } from "next/cache";

import { sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Logs Romano's 24-Jul EasyCrypto purchases (from his exchange receipts) as
 * holdings — the coins, quantities and rand cost he actually paid. Runs inside
 * the app, so it's one tap rather than four manual entries.
 *
 * `invested` is the TOTAL COST he paid (coins + fee), which is the true cost
 * basis. Guarded by a marker note so a second tap can't duplicate the buys.
 * The cash side (the R2000 that left Capitec) is handled separately — this
 * only records the coins.
 */

const MARKER = "EasyCrypto buy · 24 Jul 2026";

const BUYS = [
  { symbol: "TIA", coin: "Celestia", quantity: 33.21, invested: 200 },
  { symbol: "LINK", coin: "Chainlink", quantity: 1.375, invested: 200 },
  { symbol: "ECNMG", coin: "ECNMG", quantity: 7.18, invested: 48 },
  { symbol: "ATOM", coin: "Cosmos", quantity: 1.3316, invested: 33 },
];

export async function loadEasyCryptoBuys(): Promise<MutationResult<{ count: number }>> {
  try {
    for (const b of BUYS) {
      await sql`
        insert into holdings (symbol, coin, wallet, quantity, invested_zar, notes)
        select ${b.symbol}, ${b.coin}, 'EasyCrypto', ${b.quantity}, ${b.invested}, ${MARKER}
        where not exists (
          select 1 from holdings
          where wallet = 'EasyCrypto' and symbol = ${b.symbol} and notes = ${MARKER})`;
    }
    revalidateTag("crypto", "max");
    return { ok: true, data: { count: BUYS.length } };
  } catch (error) {
    console.error("[loadEasyCryptoBuys]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't log them." };
  }
}
