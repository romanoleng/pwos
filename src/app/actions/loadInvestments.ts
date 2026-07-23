"use server";

import { revalidateTag } from "next/cache";

import { atomic, sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * One-time loader for Romano's non-crypto investments and assets, seeded from
 * his old app's figures (2026-07-24). Crypto is deliberately excluded — the
 * Crypto module values that live, so a static line would double-count it. Debts
 * are excluded too; they're tracked on the Debt screen already.
 *
 * Runs inside the app (which holds the DB credentials), so it's one tap rather
 * than SQL by hand. Each row is a starting figure — tap it on the Investments
 * screen to update to today's value. Idempotent: skips any that already exist.
 */

type Asset = { name: string; category: string; value: number };

const ASSETS: Asset[] = [
  { name: "Retirement Annuity", category: "Investments", value: 76_600 },
  { name: "TFSA", category: "Investments", value: 1_155 },
  { name: "Equities", category: "Investments", value: 319 },
  { name: "EasyProperties", category: "Property", value: 3_073 },
  { name: "Car", category: "Vehicle", value: 40_000 },
];

const NAMES = ASSETS.map((a) => a.name.toLowerCase());

export async function loadInvestmentsAndAssets(): Promise<MutationResult<{ count: number }>> {
  try {
    await atomic((c) =>
      ASSETS.map((a) =>
        c.query(
          `insert into assets (name, category, value_zar)
           select $1, $2, $3
           where not exists (select 1 from assets where lower(name) = lower($1) and not archived)`,
          [a.name, a.category, a.value],
        ),
      ),
    );
    for (const tag of ["networth", "wealth"]) revalidateTag(tag, "max");
    return { ok: true, data: { count: ASSETS.length } };
  } catch (error) {
    console.error("[loadInvestmentsAndAssets]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't load them." };
  }
}

/** Drives whether the Investments screen still offers the one-time loader. */
export async function investmentsAlreadyLoaded(): Promise<boolean> {
  try {
    const rows = await sql<{ n: string }>`
      select count(*)::text as n from assets
      where not archived and lower(name) = any(${NAMES})`;
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
