/**
 * Record registry (CLAUDE.md §9b) — the row-level twin of editable.ts.
 *
 * editable.ts lets Romano change a *number*. This lets him change the *rows*:
 * add an account, retire a goal he's finished with, drop a stale line he can't
 * explain any more. Without it, every structural change needs a migration from
 * me, which means the app's shape is only ever as current as my last session.
 *
 * Same security shape as editable.ts: the browser sends a registry KEY, never a
 * table name. A generic "insert into table X" action would let anything running
 * in the page write anywhere in the database.
 *
 * Removal is always archive, never delete (§9b). Rows carry history — a debt
 * has an audit trail, an account has transactions pointing at it — and a
 * deleted row takes all of that with it.
 */

import { parseAmount } from "./amount.ts";

export type RecordKind =
  | "account"
  | "asset"
  | "debt"
  | "goal"
  | "kidAccount";

export type RecordField = {
  name: string;
  label: string;
  kind: "text" | "currency" | "select";
  required?: boolean;
  options?: string[];
  hint?: string;
  placeholder?: string;
};

export type RecordType = {
  kind: RecordKind;
  /** Real table. Server-side only — never sent by or accepted from the client. */
  table: string;
  /** Singular, lowercase, for messages: "Archived the Vehicle asset". */
  noun: string;
  /** accounts.id is text and user-supplied; the rest are bigint identities. */
  idIsText: boolean;
  /** Column holding the human name, used in confirmations. */
  labelColumn: string;
  fields: RecordField[];
  invalidates: string[];
};

const MONEY_HINT = "Leave blank if you genuinely don't know it yet.";

export const RECORD_TYPES: Record<RecordKind, RecordType> = {
  account: {
    kind: "account",
    table: "accounts",
    noun: "account",
    idIsText: true,
    labelColumn: "label",
    invalidates: ["accounts", "networth", "wealth", "home", "transactions"],
    fields: [
      { name: "label", label: "Name", kind: "text", required: true, placeholder: "Discovery Bank" },
      {
        name: "kind", label: "Type", kind: "select", required: true,
        options: ["cash", "savings", "business", "crypto", "other"],
      },
      {
        name: "balance_zar", label: "Balance", kind: "currency",
        hint: MONEY_HINT,
      },
    ],
  },
  asset: {
    kind: "asset",
    table: "assets",
    noun: "asset",
    idIsText: false,
    labelColumn: "name",
    invalidates: ["networth", "wealth"],
    fields: [
      { name: "name", label: "Name", kind: "text", required: true, placeholder: "Second vehicle" },
      {
        name: "category", label: "Category", kind: "select", required: true,
        options: ["Investments", "Property", "Vehicle", "Savings", "Other"],
      },
      { name: "value_zar", label: "Value", kind: "currency", required: true },
    ],
  },
  debt: {
    kind: "debt",
    table: "debts",
    noun: "debt",
    idIsText: false,
    labelColumn: "name",
    invalidates: ["debt", "networth", "wealth"],
    fields: [
      { name: "name", label: "Creditor", kind: "text", required: true, placeholder: "Woolworths card" },
      { name: "balance_zar", label: "Balance owed", kind: "currency", required: true },
      { name: "monthly_zar", label: "Monthly payment", kind: "currency" },
    ],
  },
  goal: {
    kind: "goal",
    table: "goals",
    noun: "goal",
    idIsText: false,
    labelColumn: "name",
    invalidates: ["goals", "networth", "wealth"],
    fields: [
      { name: "name", label: "Goal", kind: "text", required: true, placeholder: "New laptop" },
      { name: "current_zar", label: "Saved so far", kind: "currency" },
      { name: "target_zar", label: "Target", kind: "currency" },
      { name: "monthly_zar", label: "Monthly contribution", kind: "currency" },
    ],
  },
  kidAccount: {
    kind: "kidAccount",
    table: "kids_accounts",
    noun: "account",
    idIsText: false,
    labelColumn: "account",
    invalidates: ["goals", "kids", "networth", "wealth"],
    fields: [
      { name: "child", label: "Whose", kind: "select", required: true, options: ["Lisa", "Liam"] },
      { name: "account", label: "Account", kind: "text", required: true, placeholder: "Money Market" },
      {
        name: "account_type", label: "Type", kind: "select", required: true,
        // Drives whether it shows under Investments or as reachable savings.
        options: ["Savings", "32-Day Notice", "TFSA", "Retirement Annuity", "Investments"],
      },
      { name: "institution", label: "Institution", kind: "text", placeholder: "Capitec" },
      { name: "balance_zar", label: "Balance", kind: "currency" },
      { name: "monthly_zar", label: "Monthly contribution", kind: "currency" },
    ],
  },
};

export function recordType(kind: string): RecordType | null {
  return RECORD_TYPES[kind as RecordKind] ?? null;
}

/**
 * Validate a submitted row against its registry entry.
 *
 * Returns the columns to write, or an error. Anything not declared as a field
 * is dropped rather than passed through — a client that invents an extra key
 * must not be able to set a column the registry never offered.
 */
export function validateRecord(
  type: RecordType,
  input: Record<string, unknown>,
): { values: Record<string, string | number | null> } | { error: string } {
  const values: Record<string, string | number | null> = {};

  for (const field of type.fields) {
    const raw = input[field.name];
    const text = typeof raw === "string" ? raw.trim() : raw;

    if (text === undefined || text === null || text === "") {
      if (field.required) return { error: `${field.label} is required.` };
      values[field.name] = null;
      continue;
    }

    if (field.kind === "currency") {
      const numeric = parseAmount(text as string | number);
      if (numeric === null) return { error: `${field.label} must be a number.` };
      // Same guard as editable.ts: an extra zero is a common, costly slip.
      if (Math.abs(numeric) > 1_000_000_000) return { error: `${field.label} looks too large.` };
      values[field.name] = numeric;
      continue;
    }

    const asString = String(text);
    if (asString.length > 120) return { error: `${field.label} is too long.` };
    if (field.kind === "select" && field.options && !field.options.includes(asString)) {
      return { error: `${asString} isn't a valid ${field.label.toLowerCase()}.` };
    }
    values[field.name] = asString;
  }

  return { values };
}

/** A stable, readable id for user-created accounts (accounts.id is text). */
export function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "account"
  );
}
