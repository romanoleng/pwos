/**
 * Transactions module (CLAUDE.md §5).
 *
 * Type is inferred at read time until the Airtable Type field exists — see
 * src/lib/transactions.ts. Every row carries how its type was decided, so the
 * UI can distinguish stated from guessed.
 */
import "server-only";

import { isNonAccount, resolveAccount } from "@/lib/accounts";
import { FIELDS, TABLES } from "@/lib/airtable-fields";
import {
  budgetCategoryFor,
  inferTransactionType,
  isNonFinancialCategory,
  type TransactionType,
} from "@/lib/transactions";

import { listRecords, numberCell, stringCell } from "./airtable";

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
  notes: string | null;
};

const TXN_FIELDS = [
  FIELDS.transactions.description,
  FIELDS.transactions.amount,
  FIELDS.transactions.category,
  FIELDS.transactions.account,
  FIELDS.transactions.date,
  FIELDS.transactions.notes,
] as const;

export async function getTransactions(): Promise<TransactionRow[]> {
  const records = await listRecords(TABLES.transactions, { fieldIds: TXN_FIELDS });

  const rows: TransactionRow[] = [];

  for (const record of records) {
    const category = stringCell(record, FIELDS.transactions.category);
    const rawAccount = stringCell(record, FIELDS.transactions.account);

    // A task note in the ledger must never reach a balance or a budget.
    if (isNonFinancialCategory(category) || isNonAccount(rawAccount)) continue;

    const amountZar = numberCell(record, FIELDS.transactions.amount) ?? 0;
    const inference = inferTransactionType(category, amountZar);
    const account = resolveAccount(rawAccount);

    rows.push({
      recordId: record.id,
      date: stringCell(record, FIELDS.transactions.date),
      description: stringCell(record, FIELDS.transactions.description) ?? "—",
      amountZar,
      category,
      budgetCategory: budgetCategoryFor(category),
      rawAccount,
      accountId: account?.id ?? null,
      accountLabel: account?.label ?? rawAccount,
      type: inference.type,
      typeConfidence: inference.confidence,
      typeReason: inference.reason,
      notes: stringCell(record, FIELDS.transactions.notes),
    });
  }

  // Newest first. Rows with no date sort last rather than to the top.
  return rows.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}
