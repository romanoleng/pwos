/**
 * Net Worth — derived (CLAUDE.md §3).
 * Assets from Postgres plus live crypto; liabilities from the debts table.
 */
import "server-only";

import { money, sql } from "./db";
import { getDebtSummary } from "./debt";
import { getPortfolio } from "./crypto";

export type NetWorthClass = {
  category: string;
  valueZar: number;
  live: boolean;
  rows: { recordId: string; name: string; valueZar: number }[];
};

export type NetWorthSummary = {
  assetsZar: number; liabilitiesZar: number; netZar: number;
  classes: NetWorthClass[];
  /** Each debt as a line, so the whole net-worth story fits on one page. */
  liabilities: { recordId: string; name: string; balanceZar: number }[];
  dedupedLiabilitiesZar: number; dedupedNetZar: number; duplicateOvercountZar: number;
  storedCryptoZar: number; liveCryptoZar: number;
};

export async function getNetWorth(): Promise<NetWorthSummary> {
  const [assetRows, accountRows, debt, portfolio] = await Promise.all([
    sql<{ id: string; name: string; category: string; value_zar: string }>`
      select id::text, name, category, value_zar from assets where not archived`,
    sql<{ id: string; label: string; kind: string; balance_zar: string | null }>`
      select id, label, kind::text, balance_zar from accounts
      where not archived and kind <> 'crypto' and balance_zar is not null`,
    getDebtSummary(),
    getPortfolio(),
  ]);

  const byCategory = new Map<string, NetWorthClass>();
  const add = (category: string, row: { recordId: string; name: string; valueZar: number }) => {
    const entry = byCategory.get(category) ?? { category, valueZar: 0, live: false, rows: [] };
    entry.valueZar += row.valueZar;
    entry.rows.push(row);
    byCategory.set(category, entry);
  };

  for (const a of assetRows) {
    add(a.category, { recordId: a.id, name: a.name, valueZar: money(a.value_zar) });
  }
  for (const a of accountRows) {
    add(a.kind === "savings" ? "Savings" : "Cash", {
      recordId: a.id, name: a.label, valueZar: money(a.balance_zar),
    });
  }

  const liveCryptoZar = portfolio.totals.valueZar;
  byCategory.set("Crypto", { category: "Crypto", valueZar: liveCryptoZar, live: true, rows: [] });

  const classes = [...byCategory.values()].sort((a, b) => b.valueZar - a.valueZar);
  const assetsZar = classes.reduce((total, e) => total + e.valueZar, 0);

  return {
    assetsZar,
    liabilitiesZar: debt.totalZar,
    netZar: assetsZar - debt.totalZar,
    classes,
    liabilities: debt.rows.map((r) => ({
      recordId: r.recordId,
      name: r.name,
      balanceZar: r.balanceZar,
    })),
    dedupedLiabilitiesZar: debt.dedupedTotalZar,
    dedupedNetZar: assetsZar - debt.dedupedTotalZar,
    duplicateOvercountZar: debt.totalZar - debt.dedupedTotalZar,
    storedCryptoZar: liveCryptoZar,
    liveCryptoZar,
  };
}
