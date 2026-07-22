/**
 * Editable-field registry (CLAUDE.md §9b).
 *
 * Every number the UI can change is declared here, once. The browser sends a
 * registry KEY plus a value — never a table id, field id, or column name.
 *
 * That matters: a generic "update table X column Y" action would let anything
 * running in the page rewrite any row in the database, including milestone
 * plans and cost bases. The allow-list means an attacker-controlled or buggy
 * client can only ever set values the server already agreed are editable.
 */

export type EditableKind = "currency" | "number" | "text" | "date";

/** Tables the registry may reference. Mirrors TABLES in airtable-fields. */
export type EditableTable =
  | "accounts"
  | "assets"
  | "debtTracker"
  | "savingsGoals"
  | "kidsAccounts"
  | "budget"
  | "holdings";

export type EditableField = {
  key: string;
  table: EditableTable;
  /** Postgres column. Still an allow-list: the client only ever sends `key`. */
  fieldId: string;
  label: string;
  kind: EditableKind;
  min?: number;
  max?: number;
  /** Cache tags to invalidate after a successful write. */
  invalidates: string[];
};

export const EDITABLE: Record<string, EditableField> = {
  "netWorth.value": {
    key: "netWorth.value",
    table: "accounts",
    fieldId: "balance_zar",
    label: "Value",
    kind: "currency",
    invalidates: ["accounts", "networth", "wealth"],
  },
  "asset.value": {
    key: "asset.value",
    table: "assets",
    fieldId: "value_zar",
    label: "Value",
    kind: "currency",
    invalidates: ["networth", "wealth"],
  },
  "debt.balance": {
    key: "debt.balance",
    table: "debtTracker",
    fieldId: "balance_zar",
    label: "Outstanding balance",
    kind: "currency",
    min: 0,
    invalidates: ["debt", "networth", "wealth"],
  },
  "debt.monthly": {
    key: "debt.monthly",
    table: "debtTracker",
    fieldId: "monthly_zar",
    label: "Monthly payment",
    kind: "currency",
    min: 0,
    invalidates: ["debt"],
  },
  "budget.budgeted": {
    key: "budget.budgeted",
    table: "budget",
    fieldId: "budgeted_zar",
    label: "Budgeted",
    kind: "currency",
    min: 0,
    invalidates: ["budget"],
  },
  "goal.balance": {
    key: "goal.balance",
    table: "savingsGoals",
    fieldId: "current_zar",
    label: "Current balance",
    kind: "currency",
    min: 0,
    invalidates: ["goals", "networth", "wealth"],
  },
  "goal.target": {
    key: "goal.target",
    table: "savingsGoals",
    fieldId: "target_zar",
    label: "Target",
    kind: "currency",
    min: 0,
    invalidates: ["goals"],
  },
  "goal.monthly": {
    key: "goal.monthly",
    table: "savingsGoals",
    fieldId: "monthly_zar",
    label: "Monthly contribution",
    kind: "currency",
    min: 0,
    invalidates: ["goals"],
  },
  "kids.monthly": {
    key: "kids.monthly",
    table: "kidsAccounts",
    fieldId: "monthly_zar",
    label: "Monthly contribution",
    kind: "currency",
    min: 0,
    invalidates: ["kids", "networth", "wealth"],
  },
  "kids.balance": {
    key: "kids.balance",
    table: "kidsAccounts",
    fieldId: "balance_zar",
    label: "Balance",
    kind: "currency",
    min: 0,
    invalidates: ["kids", "networth", "wealth"],
  },
};

export function editableField(key: string): EditableField | null {
  return EDITABLE[key] ?? null;
}

/** Validation shared by client and server, so both reject the same things. */
export function validateEditable(
  field: EditableField,
  value: number | string,
): string | null {
  if (field.kind === "currency" || field.kind === "number") {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return "Enter a number.";
    if (field.min !== undefined && numeric < field.min) {
      return `Can't be less than ${field.min}.`;
    }
    if (field.max !== undefined && numeric > field.max) {
      return `Can't be more than ${field.max}.`;
    }
    // A wealth app should query an implausible entry rather than accept it
    // silently — a fat-fingered extra zero is a common and costly mistake.
    if (Math.abs(numeric) > 1_000_000_000) return "That looks too large.";
  }
  return null;
}
