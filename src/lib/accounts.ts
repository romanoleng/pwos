/**
 * Canonical account registry (CLAUDE.md §5, Banking/Accounts).
 *
 * Transactions and Net Worth name the same accounts differently, so the app
 * resolves both to one canonical id. This is a *read-time* mapping — no
 * Airtable record is rewritten — so it is reversible and cannot corrupt the
 * source data if a guess here turns out to be wrong.
 *
 * Every alias below is evidenced from the data, not assumed:
 *   - "Main Account" → Capitec Main. A row reads
 *     "Transfer: Capitec Main → Luno", so the account is Capitec Main.
 *   - "Capitec" → Capitec Main. The personal current account; 44 rows.
 *   - "TymeBank" is deliberately NOT aliased to GOtyme. A TymeBank row reads
 *     "Payment to J LENG GoTyme Bank" — money moving *between* them, so they
 *     are different banks. TymeBank has 29 transactions and no recorded
 *     balance, which the UI surfaces rather than hides.
 */

export type AccountKind = "cash" | "savings" | "business" | "crypto" | "unknown";

export type CanonicalAccount = {
  id: string;
  label: string;
  kind: AccountKind;
  /** Entity for the §4 filter. */
  entity: "personal" | "business" | "family";
  /** Counts toward safe-to-spend (§5, Budgets). */
  spendable: boolean;
  /** Name used in the Net Worth table, when it has a row there. */
  netWorthName?: string;
  /** Every spelling seen in Transactions.Account. */
  aliases: string[];
};

export const ACCOUNTS: CanonicalAccount[] = [
  {
    id: "capitec-main",
    label: "Capitec Main",
    kind: "cash",
    entity: "personal",
    spendable: true,
    netWorthName: "Capitec Main",
    aliases: ["Capitec Main", "Capitec", "Main Account"],
  },
  {
    id: "gotyme",
    label: "GOtyme Bank",
    kind: "cash",
    entity: "personal",
    spendable: true,
    netWorthName: "GOtyme Bank",
    aliases: ["GOtyme Bank", "GOtyme", "GoTyme"],
  },
  {
    id: "tymebank",
    label: "TymeBank",
    kind: "cash",
    entity: "personal",
    // Not spendable: with no recorded balance we cannot honestly include it in
    // safe-to-spend. Counting an unknown balance as available money is exactly
    // the kind of optimism that makes a wealth app dangerous.
    spendable: false,
    aliases: ["TymeBank", "Tyme Bank", "TymeBank EveryDay (51012204711)"],
  },
  {
    id: "absa",
    label: "Absa (Romano)",
    kind: "cash",
    entity: "personal",
    spendable: false,
    netWorthName: "Absa (Romano)",
    aliases: ["ABSA", "Absa", "Absa (Romano)"],
  },
  {
    id: "capitec-business",
    label: "Capitec Business",
    kind: "business",
    entity: "business",
    // §5: business money is excluded from personal safe-to-spend.
    spendable: false,
    netWorthName: "Capitec Business (CreativeDigital)",
    aliases: ["Capitec Business", "Capitec Business (CreativeDigital)"],
  },
  {
    id: "capitec-savings",
    label: "Capitec Savings",
    kind: "savings",
    entity: "personal",
    spendable: false,
    netWorthName: "Capitec Savings (Romano)",
    aliases: ["Capitec Savings", "Capitec Savings (Romano)"],
  },
  {
    id: "creative-tax",
    label: "Creative Tax",
    kind: "savings",
    entity: "business",
    spendable: false,
    netWorthName: "Creative Tax (Capitec Savings)",
    aliases: ["Creative Tax", "Creative Tax (Capitec Savings)"],
  },
  {
    id: "capitec-rewards",
    label: "Capitec Rewards",
    kind: "savings",
    entity: "personal",
    spendable: false,
    netWorthName: "Capitec Rewards (Romano)",
    aliases: ["Capitec Rewards", "Capitec Rewards (Romano)"],
  },
  {
    id: "luno",
    label: "Luno",
    kind: "crypto",
    entity: "personal",
    spendable: false,
    aliases: ["Luno"],
  },
  {
    id: "tangem",
    label: "Tangem Hardware Wallet",
    kind: "crypto",
    entity: "personal",
    spendable: false,
    aliases: ["Tangem Hardware Wallet", "Tangem"],
  },
  {
    id: "easycrypto",
    label: "EasyCrypto",
    kind: "crypto",
    entity: "personal",
    spendable: false,
    aliases: ["EasyCrypto", "Easy Crypto"],
  },
];

/**
 * Rows whose Account is not a financial account at all. The Transactions table
 * contains a "System" row reading "Add api.coingecko.com to Claude network
 * egress" — a note that must never reach a balance or a budget.
 */
export const NON_ACCOUNT_SOURCES = new Set(["System"]);

const BY_ALIAS = new Map<string, CanonicalAccount>();
for (const account of ACCOUNTS) {
  for (const alias of account.aliases) {
    BY_ALIAS.set(alias.trim().toLowerCase(), account);
  }
}

export function resolveAccount(raw: string | null | undefined): CanonicalAccount | null {
  if (!raw) return null;
  return BY_ALIAS.get(raw.trim().toLowerCase()) ?? null;
}

export function isNonAccount(raw: string | null | undefined): boolean {
  return raw ? NON_ACCOUNT_SOURCES.has(raw.trim()) : false;
}

export function accountById(id: string): CanonicalAccount | undefined {
  return ACCOUNTS.find((account) => account.id === id);
}

/** Net Worth row name → canonical account, for reading stored balances. */
export function resolveByNetWorthName(name: string | null | undefined): CanonicalAccount | null {
  if (!name) return null;
  const trimmed = name.trim().toLowerCase();
  return (
    ACCOUNTS.find((account) => account.netWorthName?.toLowerCase() === trimmed) ?? null
  );
}
