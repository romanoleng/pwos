"use server";

import { revalidateTag } from "next/cache";

import { ensureInstitutionColumn } from "@/lib/server/accounts";
import { atomic, sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * One-time loader for Romano's real Capitec + GOtyme savings pots (2026-07-24).
 *
 * Runs entirely inside the app, which already holds the database credentials —
 * so Romano taps a button instead of running SQL against Neon by hand. It
 * archives the current savings pots (recoverable, never deleted), then upserts
 * the real ones with their bank tag, all in one transaction. Idempotent: a
 * second run just refreshes balances. The Savings screen only offers it while
 * no bank-tagged savings exist yet, so it can't later wipe maintained data.
 */

type Pot = { id: string; label: string; entity: "personal" | "business"; balance: number; bank: string };

const POTS: Pot[] = [
  // Capitec
  { id: "sav-bluetooth-speaker", label: "Bluetooth Speaker", entity: "personal", balance: 5.64, bank: "Capitec" },
  { id: "sav-wood", label: "Wood", entity: "personal", balance: 0.28, bank: "Capitec" },
  { id: "sav-dj-controller", label: "DJ Controller", entity: "personal", balance: 0.56, bank: "Capitec" },
  { id: "sav-tax", label: "Tax", entity: "personal", balance: 0.81, bank: "Capitec" },
  { id: "sav-big-emergency-fund", label: "Big Emergency Fund", entity: "personal", balance: 5.04, bank: "Capitec" },
  { id: "sav-debt-clearance", label: "Debt Clearance", entity: "personal", balance: 0.10, bank: "Capitec" },
  { id: "sav-car-purchase", label: "Car Purchase", entity: "personal", balance: 1.38, bank: "Capitec" },
  { id: "sav-creativetax", label: "CreativeTax", entity: "business", balance: 0.00, bank: "Capitec" },
  // GOtyme
  { id: "sav-emergency-fund-small", label: "Emergency Fund Small", entity: "personal", balance: 502.30, bank: "GOtyme" },
  { id: "sav-new-car-deposit", label: "New Car Deposit", entity: "personal", balance: 4.08, bank: "GOtyme" },
  { id: "sav-bathroom-maintenance", label: "Bathroom Maintenance", entity: "personal", balance: 0.00, bank: "GOtyme" },
  { id: "sav-patio-braai-savings", label: "Patio Braai Savings", entity: "personal", balance: 0.00, bank: "GOtyme" },
  { id: "sav-kids-tv", label: "Kids Tv", entity: "personal", balance: 0.00, bank: "GOtyme" },
  { id: "sav-garage-cupboards", label: "Garage Cupboards", entity: "personal", balance: 0.00, bank: "GOtyme" },
  { id: "sav-lounge-suite", label: "Lounge Suite", entity: "personal", balance: 0.00, bank: "GOtyme" },
  { id: "sav-kitchen-revamp", label: "Kitchen Top Plus Revamp", entity: "personal", balance: 0.00, bank: "GOtyme" },
  { id: "sav-console", label: "Console", entity: "personal", balance: 0.00, bank: "GOtyme" },
  { id: "sav-iphone-20", label: "iPhone 20", entity: "personal", balance: 0.00, bank: "GOtyme" },
];

// The kids' own pots — kept OUT of Romano's net worth (kids_accounts).
const KIDS = [
  { account: "Lisa Savings", child: "Lisa", balance: 0.00 },
  { account: "Liam Savings", child: "Liam", balance: 1.22 },
];

export async function loadBankSavings(): Promise<MutationResult<{ accounts: number }>> {
  try {
    await ensureInstitutionColumn();

    // Archive-current + upsert-new + add-kids, all in ONE transaction so it
    // can't half-apply. The kids inserts are guarded so a re-run won't
    // duplicate them.
    await atomic((c) => [
      c.query(`update accounts set archived = true where kind = 'savings' and not archived`, []),
      ...POTS.map((p) =>
        c.query(
          `insert into accounts (id, label, kind, entity, spendable, balance_zar, institution)
           values ($1, $2, 'savings', $3, false, $4, $5)
           on conflict (id) do update
             set label = excluded.label, kind = excluded.kind, entity = excluded.entity,
                 spendable = excluded.spendable, balance_zar = excluded.balance_zar,
                 institution = excluded.institution, archived = false`,
          [p.id, p.label, p.entity, p.balance, p.bank],
        ),
      ),
      ...KIDS.map((k) =>
        c.query(
          `insert into kids_accounts (account, child, institution, account_type, balance_zar)
           select $1, $2, 'Capitec', 'Savings', $3
           where not exists (select 1 from kids_accounts where account = $1 and child = $2)`,
          [k.account, k.child, k.balance],
        ),
      ),
    ]);

    for (const tag of ["accounts", "networth", "wealth", "goals", "kids", "home"]) {
      revalidateTag(tag, "max");
    }
    return { ok: true, data: { accounts: POTS.length } };
  } catch (error) {
    console.error("[loadBankSavings]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't load the pots." };
  }
}

/** Drives whether the Savings screen still offers the one-time loader. */
export async function bankSavingsAlreadyLoaded(): Promise<boolean> {
  try {
    await ensureInstitutionColumn();
    const rows = await sql<{ n: string }>`
      select count(*)::text as n from accounts
      where kind = 'savings' and not archived and institution is not null`;
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
