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
 *   - "TymeBank" IS GOtyme. An earlier reading of "Payment to J LENG GoTyme
 *     Bank" suggested two different banks; in fact that was a payment to
 *     someone else's GoTyme account. Romano confirmed he holds one account
 *     with them, and the 151 TymeBank rows were merged into GOtyme on
 *     2026-07-22.
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
    // TymeBank was the same account under an older name — Romano holds only
    // one account with them. Its 151 historical transactions were merged here
    // on 2026-07-22, so the old spellings must still resolve.
    aliases: [
      "GOtyme Bank",
      "GOtyme",
      "GoTyme",
      "TymeBank",
      "Tyme Bank",
      "TymeBank EveryDay (51012204711)",
    ],
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
