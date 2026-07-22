/**
 * Transactions (CLAUDE.md §5).
 *
 * Type is a column with an enum, not an inference. The sign constraint means a
 * positive expense cannot exist, so `signAnomaly` is now always false — kept in
 * the shape so the UI needs no change, and because rows edited directly in SQL
 * could in principle still be checked.
 */
import "server-only";

import { budgetCategoryFor, type TransactionType } from "@/lib/transactions";

import { isoDate, money, sql } from "./db";

export type TransactionRow = {
  recordId: string;
  date: string | null;
  description: string;
  amountZar: number;
  category: string | null;
  budgetCategory: string | null;
  rawAccount: string | null;
  accountId: string | null;
  accountLabel: string | null;
  type: TransactionType;
  typeConfidence: "stated" | "high" | "low";
  typeReason: string;
  signAnomaly: boolean;
  notes: string | null;
};

type Row = {
  id: string;
  occurred_on: string;
  description: string;
  amount_zar: string;
  type: TransactionType;
  category: string | null;
  original_category: string | null;
  account_id: string | null;
  account_label: string | null;
  notes: string | null;
};

export async function getTransactions(): Promise<TransactionRow[]> {
  const rows = await sql<Row>`
    select t.id::text, t.occurred_on::text, t.description, t.amount_zar, t.type,
           t.category, t.original_category, t.account_id, a.label as account_label, t.notes
    from transactions t
    left join accounts a on a.id = t.account_id
    order by t.occurred_on desc, t.id desc`;

  return rows.map((r) => ({
    recordId: r.id,
    date: isoDate(r.occurred_on),
    description: r.description,
    amountZar: money(r.amount_zar),
    category: r.category,
    // The category IS the budget line now, so no mapping is needed. Falling
    // back keeps rows written before consolidation working.
    budgetCategory: r.category ?? budgetCategoryFor(r.original_category, r.description),
    rawAccount: r.original_category ? r.account_label : r.account_label,
    accountId: r.account_id,
    accountLabel: r.account_label,
    type: r.type,
    typeConfidence: "stated",
    typeReason: "Type column",
    signAnomaly: false,
    notes: r.notes,
  }));
}
