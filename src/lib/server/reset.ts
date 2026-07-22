/**
 * Payday reset (CLAUDE.md §5, added 2026-07-22).
 *
 * Once a cycle Romano reconciles the app against reality: real balances from
 * each bank, real debt figures, real budget for the coming cycle. This gathers
 * everything editable into one screen so it is a single pass rather than a hunt
 * across five modules.
 *
 * Transactions are deliberately untouched — the reset corrects *positions*, not
 * history.
 */
import "server-only";

import { resolveByNetWorthName } from "@/lib/accounts";
import { FIELDS, TABLES } from "@/lib/airtable-fields";
import { getBudgetCycle } from "@/lib/budget";

import { listRecords, numberCell, stringCell } from "./airtable";

export type ResetRow = {
  recordId: string;
  label: string;
  /** Registry key from src/lib/editable.ts — the server decides the field. */
  editKey: string;
  currentZar: number | null;
  hint?: string;
};

export type ResetGroup = {
  title: string;
  description: string;
  rows: ResetRow[];
};

export type ResetState = {
  groups: ResetGroup[];
  cycle: { start: string; end: string; budgetMonth: string };
};

export async function getResetState(): Promise<ResetState> {
  const cycle = getBudgetCycle();

  const [netWorth, debts, budget, goals, kids] = await Promise.all([
    listRecords(TABLES.netWorth, {
      fieldIds: [FIELDS.netWorth.name, FIELDS.netWorth.type, FIELDS.netWorth.category, FIELDS.netWorth.valueZar],
    }),
    listRecords(TABLES.debtTracker, {
      fieldIds: [FIELDS.debt.name, FIELDS.debt.balanceZar, FIELDS.debt.monthlyZar, FIELDS.debt.status],
    }),
    listRecords(TABLES.budget, {
      fieldIds: [FIELDS.budget.category, FIELDS.budget.budgetedZar, FIELDS.budget.month, FIELDS.budget.type],
    }),
    listRecords(TABLES.savingsGoals),
    listRecords(TABLES.kidsAccounts),
  ]);

  const assets = netWorth.filter(
    (r) => stringCell(r, FIELDS.netWorth.type) === "Asset",
  );

  // Cash and savings first — these are what actually change every payday.
  const accountRows = assets
    .filter((r) => {
      const category = stringCell(r, FIELDS.netWorth.category);
      return category === "Cash" || category === "Savings";
    })
    .map((r) => {
      const name = stringCell(r, FIELDS.netWorth.name) ?? "—";
      const account = resolveByNetWorthName(name);
      return {
        recordId: r.id,
        label: name,
        editKey: "netWorth.value",
        currentZar: numberCell(r, FIELDS.netWorth.valueZar),
        hint: account?.spendable ? "counts toward safe-to-spend" : undefined,
      } satisfies ResetRow;
    })
    .sort((a, b) => (b.currentZar ?? 0) - (a.currentZar ?? 0));

  const otherAssetRows = assets
    .filter((r) => {
      const category = stringCell(r, FIELDS.netWorth.category);
      return category !== "Cash" && category !== "Savings" && category !== "Crypto";
    })
    .map((r) => ({
      recordId: r.id,
      label: stringCell(r, FIELDS.netWorth.name) ?? "—",
      editKey: "netWorth.value",
      currentZar: numberCell(r, FIELDS.netWorth.valueZar),
    }));

  const debtRows = debts
    .map((r) => ({
      recordId: r.id,
      label: stringCell(r, FIELDS.debt.name) ?? "—",
      editKey: "debt.balance",
      currentZar: numberCell(r, FIELDS.debt.balanceZar),
      hint: stringCell(r, FIELDS.debt.status) ?? undefined,
    }))
    .sort((a, b) => (b.currentZar ?? 0) - (a.currentZar ?? 0));

  const budgetRows = budget
    .filter((r) => {
      const month = stringCell(r, FIELDS.budget.month);
      return month ? month.slice(0, 7) === cycle.budgetMonth.slice(0, 7) : false;
    })
    .map((r) => ({
      recordId: r.id,
      label: stringCell(r, FIELDS.budget.category) ?? "—",
      editKey: "budget.budgeted",
      currentZar: numberCell(r, FIELDS.budget.budgetedZar),
      hint: stringCell(r, FIELDS.budget.type) ?? undefined,
    }))
    .sort((a, b) => (b.currentZar ?? 0) - (a.currentZar ?? 0));

  const goalRows = goals.map((r) => ({
    recordId: r.id,
    label: stringCell(r, "fldCDKjnCjOW6sUu1") ?? "—",
    editKey: "goal.balance",
    currentZar: numberCell(r, "fldSmsn73477TEYE0"),
  }));

  const kidRows = kids.map((r) => ({
    recordId: r.id,
    label: `${stringCell(r, "fldYSUjwg09Rejvkc") ?? "—"}${
      stringCell(r, "fldRe1SuyyfoDl3J7") ? ` · ${stringCell(r, "fldRe1SuyyfoDl3J7")}` : ""
    }`,
    editKey: "kids.balance",
    currentZar: numberCell(r, "fldP70Dc7YXA3A0KB"),
  }));

  return {
    cycle: { start: cycle.start, end: cycle.end, budgetMonth: cycle.budgetMonth },
    groups: [
      {
        title: "Cards and cash",
        description: "What each account actually holds right now.",
        rows: accountRows,
      },
      {
        title: "Debt",
        description: "Outstanding balances. Correcting duplicates here fixes net worth.",
        rows: debtRows,
      },
      {
        title: "Budget for this cycle",
        description: `${cycle.start} → ${cycle.end}. What you're allocating, not what you've spent.`,
        rows: budgetRows,
      },
      {
        title: "Savings goals",
        description: "Current balance in each goal.",
        rows: goalRows,
      },
      {
        title: "Lisa & Liam",
        description: "Kids' account balances.",
        rows: kidRows,
      },
      {
        title: "Other assets",
        description: "Vehicle, property and investments. Crypto is live and not listed.",
        rows: otherAssetRows,
      },
    ].filter((group) => group.rows.length > 0),
  };
}
