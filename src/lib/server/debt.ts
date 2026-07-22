/**
 * Debt (CLAUDE.md §3, §5). Postgres is the single source; duplicates are
 * recorded explicitly via debts.duplicate_of rather than guessed from names.
 */
import "server-only";

import { findDuplicates, type DebtRow, type DebtSummary } from "@/lib/debt";

import { isoDate, money, sql } from "./db";

type Row = {
  id: string; name: string; kind: string | null; balance_zar: string;
  monthly_zar: string; interest_pct: string | null; priority: string | null;
  status: string | null; target_payoff: string | null; duplicate_of: string | null;
};

export async function getDebtSummary(): Promise<DebtSummary> {
  const rows = await sql<Row>`
    select id::text, name, kind, balance_zar, monthly_zar, interest_pct,
           priority, status, target_payoff::text, duplicate_of::text
    from debts where not archived order by balance_zar desc`;

  const debts: DebtRow[] = rows.map((r) => ({
    recordId: r.id,
    name: r.name,
    type: r.kind,
    balanceZar: money(r.balance_zar),
    monthlyZar: money(r.monthly_zar),
    interestPct: r.interest_pct === null ? null : money(r.interest_pct),
    priority: r.priority,
    status: r.status,
    payoffDate: isoDate(r.target_payoff),
  }));

  // Explicitly marked duplicates, plus any exact name collisions.
  const marked = rows.filter((r) => r.duplicate_of !== null);
  const overcount = marked.reduce((total, r) => total + money(r.balance_zar), 0);
  const totalZar = debts.reduce((total, d) => total + d.balanceZar, 0);

  const nameGroups = findDuplicates(debts);
  const heuristicOvercount = nameGroups.reduce(
    (total, g) => total + (g.countedZar - g.dedupedZar), 0);

  return {
    rows: debts,
    totalZar,
    dedupedTotalZar: totalZar - overcount - heuristicOvercount,
    monthlyZar: debts.reduce((total, d) => total + d.monthlyZar, 0),
    duplicates: nameGroups,
    // Postgres holds liabilities in one place, so there is no second source to
    // disagree with. Kept at parity so the UI needs no change.
    netWorthLiabilitiesZar: totalZar,
    discrepancyZar: 0,
  };
}
