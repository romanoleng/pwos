/**
 * Accounts module (CLAUDE.md §5, Banking/Accounts).
 *
 * Reads stored balances from Net Worth and activity from Transactions, then
 * reports both plus the discrepancy — rather than silently preferring one.
 * A wealth app that quietly picks a number when two sources disagree is worse
 * than one that shows you the disagreement.
 */
import "server-only";

import {
  ACCOUNTS,
  isNonAccount,
  resolveAccount,
  resolveByNetWorthName,
  type CanonicalAccount,
} from "@/lib/accounts";
import { FIELDS, TABLES } from "@/lib/airtable-fields";

import { listRecords, numberCell, stringCell } from "./airtable";

export type AccountBalance = {
  account: CanonicalAccount;
  /** Balance recorded in the Net Worth table, if it has a row there. */
  storedZar: number | null;
  /** Net of every transaction attributed to this account. */
  transactionNetZar: number;
  transactionCount: number;
  lastActivity: string | null;
};

export type AccountsView = {
  accounts: AccountBalance[];
  totals: {
    cashZar: number;
    spendableZar: number;
    businessZar: number;
    savingsZar: number;
  };
  /** Account names in Transactions that map to nothing — needs a human. */
  unmappedAccounts: { name: string; count: number }[];
  /** Accounts with activity but no recorded balance. */
  missingBalances: string[];
};

const NET_WORTH_FIELDS = [
  FIELDS.netWorth.name,
  FIELDS.netWorth.category,
  FIELDS.netWorth.type,
  FIELDS.netWorth.valueZar,
] as const;

export async function getAccounts(): Promise<AccountsView> {
  const [netWorthRows, transactionRows] = await Promise.all([
    listRecords(TABLES.netWorth, { fieldIds: NET_WORTH_FIELDS }),
    listRecords(TABLES.transactions, {
      fieldIds: [
        FIELDS.transactions.account,
        FIELDS.transactions.amount,
        FIELDS.transactions.date,
      ],
    }),
  ]);

  const storedByAccountId = new Map<string, number>();
  for (const row of netWorthRows) {
    const name = stringCell(row, FIELDS.netWorth.name);
    const account = resolveByNetWorthName(name);
    if (!account) continue;
    const value = numberCell(row, FIELDS.netWorth.valueZar) ?? 0;
    storedByAccountId.set(account.id, (storedByAccountId.get(account.id) ?? 0) + value);
  }

  const activity = new Map<
    string,
    { net: number; count: number; last: string | null }
  >();
  const unmapped = new Map<string, number>();

  for (const row of transactionRows) {
    const rawAccount = stringCell(row, FIELDS.transactions.account);
    if (isNonAccount(rawAccount)) continue;

    const account = resolveAccount(rawAccount);
    if (!account) {
      if (rawAccount) unmapped.set(rawAccount, (unmapped.get(rawAccount) ?? 0) + 1);
      continue;
    }

    const amount = numberCell(row, FIELDS.transactions.amount) ?? 0;
    const date = stringCell(row, FIELDS.transactions.date);
    const current = activity.get(account.id) ?? { net: 0, count: 0, last: null };
    activity.set(account.id, {
      net: current.net + amount,
      count: current.count + 1,
      last: !current.last || (date && date > current.last) ? date : current.last,
    });
  }

  const accounts: AccountBalance[] = ACCOUNTS.filter(
    (account) => account.kind !== "crypto",
  ).map((account) => {
    const seen = activity.get(account.id);
    return {
      account,
      storedZar: storedByAccountId.get(account.id) ?? null,
      transactionNetZar: seen?.net ?? 0,
      transactionCount: seen?.count ?? 0,
      lastActivity: seen?.last ?? null,
    };
  });

  // Totals use the stored balance, which is the figure Romano maintains. The
  // transaction net is a cross-check, not a replacement — the ledger doesn't
  // go back to account opening, so it can't produce an absolute balance.
  const sumWhere = (predicate: (entry: AccountBalance) => boolean) =>
    accounts
      .filter(predicate)
      .reduce((total, entry) => total + (entry.storedZar ?? 0), 0);

  return {
    accounts: accounts.sort(
      (a, b) => (b.storedZar ?? 0) - (a.storedZar ?? 0),
    ),
    totals: {
      cashZar: sumWhere((entry) => entry.account.kind === "cash"),
      spendableZar: sumWhere((entry) => entry.account.spendable),
      businessZar: sumWhere((entry) => entry.account.entity === "business"),
      savingsZar: sumWhere((entry) => entry.account.kind === "savings"),
    },
    unmappedAccounts: [...unmapped.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    missingBalances: accounts
      .filter((entry) => entry.storedZar === null && entry.transactionCount > 0)
      .map((entry) => entry.account.label),
  };
}
