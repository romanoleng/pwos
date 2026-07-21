/**
 * Domain constants from CLAUDE.md. These are *targets and policy*, not
 * financial data — balances, prices and holdings are always read live (§7).
 */

/** The hero goal (§0). */
export const FREEDOM_TARGET_ZAR = 2_000_000;
export const FREEDOM_TARGET_LABEL = "February 2028";
export const FREEDOM_TARGET_DATE = "2028-02-29";

/** Salary lands on the 24th; budget cycles run 24th → 24th (§5). */
export const PAYDAY_DAY_OF_MONTH = 24;

/** Only these get fresh monthly capital (§5). */
export const CORE_5 = ["BTC", "ETH", "XRP", "HBAR", "ENA"] as const;
export type Core5Symbol = (typeof CORE_5)[number];

/**
 * Wallets in display order (§5). Tangem's sub-buckets are stored inside the
 * free-text `Exchange / Wallet` field in Airtable, so they're parsed, not keyed.
 */
export const WALLET_ORDER = [
  "EasyCrypto",
  "Tangem — Forever Bag",
  "Tangem — Growth Engine",
  "Tangem — Trading",
  "Luno",
] as const;

/** Spendable balance excludes business money (§5, Budgets). */
export const SPENDABLE_ACCOUNTS = ["Capitec Main", "GOtyme"] as const;
