"use server";

import { revalidateTag } from "next/cache";

import { atomic, sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * One-time logger for Romano's 24-Jul EasyCrypto buys, done the RIGHT way:
 * it ADDS each buy's quantity and cost to his EXISTING position for that coin
 * (creating it only if he doesn't hold it), so nothing is duplicated and no
 * total is hand-calculated. Coins only — the cash side (the R2000 that left
 * Capitec) he reconciles himself, since only he knows the live bank figure.
 *
 * Idempotent: a hidden marker is written into each touched holding's notes and
 * checked first, so a second tap does nothing. The whole apply is one atomic
 * transaction, so it's all-or-nothing.
 */

const MARKER = "⟦ec-24jul⟧";

const BUYS = [
  { symbol: "TIA", coin: "Celestia", quantity: 33.21, invested: 200 },
  { symbol: "LINK", coin: "Chainlink", quantity: 1.375, invested: 200 },
  { symbol: "ECNMG", coin: "ECNMG", quantity: 7.18, invested: 48 },
  { symbol: "ATOM", coin: "Cosmos", quantity: 1.3316, invested: 33 },
  { symbol: "HBAR", coin: "Hedera", quantity: 404.99, invested: 500 },
  { symbol: "ENA", coin: "Ethena", quantity: 327.08, invested: 500 },
  { symbol: "POL", coin: "Polygon Ecosystem Token", quantity: 256.79, invested: 341 },
  { symbol: "FET", coin: "Artificial Superintelligence Alliance", quantity: 68.21, invested: 178 },
];

export async function logYesterdaysBuys(): Promise<
  MutationResult<{ applied: boolean; alreadyDone: boolean }>
> {
  try {
    const done = await sql`
      select 1 from holdings where wallet = 'EasyCrypto' and notes like ${`%${MARKER}%`} limit 1`;
    if (done.length > 0) return { ok: true, data: { applied: false, alreadyDone: true } };

    await atomic((c) =>
      BUYS.map((b) =>
        c.query(
          `with existing as (
             update holdings
               set quantity = quantity + $1, invested_zar = invested_zar + $2,
                   notes = coalesce(notes, '') || $5, updated_at = now()
             where id = (select id from holdings
                         where wallet = 'EasyCrypto' and symbol = $3 and not archived
                         order by quantity desc limit 1)
             returning id
           ),
           inserted as (
             insert into holdings (symbol, coin, wallet, quantity, invested_zar, notes)
             select $3, $4, 'EasyCrypto', $1, $2, $5
             where not exists (select 1 from existing)
             returning id
           )
           select 1`,
          [b.quantity, b.invested, b.symbol, b.coin, ` ${MARKER}`],
        ),
      ),
    );

    revalidateTag("crypto", "max");
    return { ok: true, data: { applied: true, alreadyDone: false } };
  } catch (error) {
    console.error("[logYesterdaysBuys]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't log them." };
  }
}
