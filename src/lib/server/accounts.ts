/**
 * Accounts module (CLAUDE.md §5, Banking/Accounts).
 *
 * Now reads Postgres. Account identity is a foreign key rather than a string
 * match, so the Capitec / Capitec Main / Main Account drift that made this
 * module necessary can no longer happen.
 */
import "server-only";

import type { AccountKind, CanonicalAccount } from "@/lib/accounts";

import { isoDate, money, moneyOrNull, sql } from "./db";

export type AccountBalance = {
  account: CanonicalAccount;
  /** NULL means genuinely unrecorded, which is not the same as zero. */
  storedZar: number | null;
  netWorthRecordId: string | null;
  transactionNetZar: number;
  transactionCount: number;
  lastActivity: string | null;
};

export type AccountsView = {
  accounts: AccountBalance[];
  totals: { cashZar: number; spendableZar: number; businessZar: number; savingsZar: number };
  unmappedAccounts: { name: string; count: number }[];
  missingBalances: string[];
};

type Row = {
  id: string;
  label: string;
  kind: AccountKind;
  entity: "personal" | "business" | "family";
  spendable: boolean;
  balance_zar: string | null;
  txn_count: string;
  txn_net: string | null;
  last_activity: string | null;
};

export async function getAccounts(): Promise<AccountsView> {
  const rows = await sql<Row>`
    select a.id, a.label, a.kind, a.entity, a.spendable, a.balance_zar,
           count(t.id)              as txn_count,
           sum(t.amount_zar)        as txn_net,
           max(t.occurred_on)::text as last_activity
    from accounts a
    left join transactions t on t.account_id = a.id
    where not a.archived
    group by a.id
    order by a.balance_zar desc nulls last`;

  const accounts: AccountBalance[] = rows
    .filter((r) => r.kind !== "crypto")
    .map((r) => ({
      account: {
        id: r.id,
        label: r.label,
        kind: r.kind,
        entity: r.entity,
        spendable: r.spendable,
        aliases: [],
      },
      storedZar: moneyOrNull(r.balance_zar),
      netWorthRecordId: r.id,
      transactionNetZar: money(r.txn_net),
      transactionCount: Number(r.txn_count),
      lastActivity: isoDate(r.last_activity),
    }));

  const sumWhere = (p: (e: AccountBalance) => boolean) =>
    accounts.filter(p).reduce((total, e) => total + (e.storedZar ?? 0), 0);

  return {
    accounts,
    totals: {
      cashZar: sumWhere((e) => e.account.kind === "cash"),
      spendableZar: sumWhere((e) => e.account.spendable),
      businessZar: sumWhere((e) => e.account.entity === "business"),
      savingsZar: sumWhere((e) => e.account.kind === "savings"),
    },
    // Foreign keys make an unmapped account impossible now: a transaction
    // cannot reference an account that does not exist.
    unmappedAccounts: [],
    missingBalances: accounts
      .filter((e) => e.storedZar === null && e.transactionCount > 0)
      .map((e) => e.account.label),
  };
}
