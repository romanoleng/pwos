/**
 * Payday reset (CLAUDE.md §5). Gathers every editable figure into one screen
 * so reconciling against reality is a single pass, not a hunt across modules.
 */
import "server-only";

import { getBudgetCycle } from "@/lib/budget";

import { moneyOrNull, sql } from "./db";

export type ResetRow = {
  recordId: string; label: string; editKey: string;
  currentZar: number | null; hint?: string;
};
export type ResetGroup = { title: string; description: string; rows: ResetRow[] };
export type ResetState = {
  groups: ResetGroup[];
  cycle: { start: string; end: string; budgetMonth: string };
};

export async function getResetState(): Promise<ResetState> {
  const cycle = getBudgetCycle();

  const [accounts, debts, budgets, goals, kids, assets] = await Promise.all([
    sql<{ id: string; label: string; balance_zar: string | null; spendable: boolean; kind: string }>`
      select id, label, balance_zar, spendable, kind::text from accounts
      where not archived and kind in ('cash','savings','business') order by balance_zar desc nulls last`,
    sql<{ id: string; name: string; balance_zar: string; status: string | null }>`
      select id::text, name, balance_zar, status from debts where not archived order by balance_zar desc`,
    sql<{ id: string; category: string; budgeted_zar: string; kind: string | null }>`
      select id::text, category, budgeted_zar, kind from budgets
      where cycle_start = ${cycle.start}::date order by budgeted_zar desc`,
    sql<{ id: string; name: string; current_zar: string }>`
      select id::text, name, current_zar from goals where not archived order by current_zar desc`,
    sql<{ id: string; account: string; child: string | null; balance_zar: string }>`
      select id::text, account, child, balance_zar from kids_accounts order by balance_zar desc`,
    sql<{ id: string; name: string; value_zar: string }>`
      select id::text, name, value_zar from assets where not archived order by value_zar desc`,
  ]);

  const groups: ResetGroup[] = [
    {
      title: "Cards and cash",
      description: "What each account actually holds right now.",
      rows: accounts.map((r) => ({
        recordId: r.id, label: r.label, editKey: "netWorth.value",
        currentZar: moneyOrNull(r.balance_zar),
        hint: r.spendable ? "counts toward safe-to-spend" : undefined,
      })),
    },
    {
      title: "Debt",
      description: "Outstanding balances.",
      rows: debts.map((r) => ({
        recordId: r.id, label: r.name, editKey: "debt.balance",
        currentZar: moneyOrNull(r.balance_zar), hint: r.status ?? undefined,
      })),
    },
    {
      title: "Budget for this cycle",
      description: `${cycle.start} → ${cycle.end}. What you're allocating, not what you've spent.`,
      rows: budgets.map((r) => ({
        recordId: r.id, label: r.category, editKey: "budget.budgeted",
        currentZar: moneyOrNull(r.budgeted_zar), hint: r.kind ?? undefined,
      })),
    },
    {
      title: "Savings goals",
      description: "Current balance in each goal.",
      rows: goals.map((r) => ({
        recordId: r.id, label: r.name, editKey: "goal.balance",
        currentZar: moneyOrNull(r.current_zar),
      })),
    },
    {
      title: "Lisa & Liam",
      description: "Kids' account balances.",
      rows: kids.map((r) => ({
        recordId: r.id, label: r.child ? `${r.account} · ${r.child}` : r.account,
        editKey: "kids.balance", currentZar: moneyOrNull(r.balance_zar),
      })),
    },
    {
      title: "Other assets",
      description: "Vehicle, property and investments. Crypto is live and not listed.",
      rows: assets.map((r) => ({
        recordId: r.id, label: r.name, editKey: "asset.value",
        currentZar: moneyOrNull(r.value_zar),
      })),
    },
  ].filter((g) => g.rows.length > 0);

  return { cycle: { start: cycle.start, end: cycle.end, budgetMonth: cycle.budgetMonth }, groups };
}
