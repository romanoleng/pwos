/**
 * Editable-field registry (CLAUDE.md §9b).
 *
 * Every number the UI can change is declared here, once. The browser sends a
 * registry KEY plus a value — never a table id, field id, or column name.
 *
 * That matters: a generic "update table X field Y" action would let anything
 * running in the page rewrite any cell in the base, including milestone plans
 * and cost bases. The allow-list means an attacker-controlled or buggy client
 * can only ever set values the server already agreed are editable.
 */

export type EditableKind = "currency" | "number" | "text" | "date";

/** Tables the registry may reference. Mirrors TABLES in airtable-fields. */
export type EditableTable =
  | "netWorth"
  | "debtTracker"
  | "savingsGoals"
  | "kidsAccounts"
  | "budget"
  | "holdings";

export type EditableField = {
  key: string;
  table: EditableTable;
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
    table: "netWorth",
    fieldId: "fldqBv7liYBBOQ3Lz",
    label: "Value",
    kind: "currency",
    invalidates: ["accounts", "networth", "wealth"],
  },
  "debt.balance": {
    key: "debt.balance",
    table: "debtTracker",
    fieldId: "fldyDq6KrUTl0MQgt",
    label: "Outstanding balance",
    kind: "currency",
    min: 0,
    invalidates: ["debt", "networth", "wealth"],
  },
  "debt.monthly": {
    key: "debt.monthly",
    table: "debtTracker",
    fieldId: "fldRylhwh9GUkXciS",
    label: "Monthly payment",
    kind: "currency",
    min: 0,
    invalidates: ["debt"],
  },
  "budget.budgeted": {
    key: "budget.budgeted",
    table: "budget",
    fieldId: "fldl87k7XXfFuzN2K",
    label: "Budgeted",
    kind: "currency",
    min: 0,
    invalidates: ["budget"],
  },
  "goal.balance": {
    key: "goal.balance",
    table: "savingsGoals",
    fieldId: "fldSmsn73477TEYE0",
    label: "Current balance",
    kind: "currency",
    min: 0,
    invalidates: ["goals", "networth", "wealth"],
  },
  "goal.target": {
    key: "goal.target",
    table: "savingsGoals",
    fieldId: "fldcDGPSwZKG4ALbJ",
    label: "Target",
    kind: "currency",
    min: 0,
    invalidates: ["goals"],
  },
  "goal.monthly": {
    key: "goal.monthly",
    table: "savingsGoals",
    fieldId: "fld64sfkThfhk7isF",
    label: "Monthly contribution",
    kind: "currency",
    min: 0,
    invalidates: ["goals"],
  },
  "kids.balance": {
    key: "kids.balance",
    table: "kidsAccounts",
    fieldId: "fldP70Dc7YXA3A0KB",
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
