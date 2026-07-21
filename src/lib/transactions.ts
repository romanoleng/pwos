/**
 * Transaction typing (CLAUDE.md §3).
 *
 * §3 requires every transaction to be income | expense | transfer |
 * contribution, because transfers and contributions must NEVER count as budget
 * spend. The Airtable table has no Type field yet, so type is inferred here at
 * read time from Category and amount sign.
 *
 * This is an interim measure, not the destination. Once a Type field exists it
 * becomes the source of truth and this becomes the fallback for rows that
 * predate it — hence `inferTransactionType` returning a confidence, so the UI
 * can show which rows were inferred rather than stated.
 */

export type TransactionType = "income" | "expense" | "transfer" | "contribution";

export type TypeInference = {
  type: TransactionType;
  /** "stated" once a Type field exists; otherwise how sure the rule is. */
  confidence: "stated" | "high" | "low";
  reason: string;
};

/**
 * Categories that move money between places you own, or into an investment.
 * Neither is spending, so neither may reach a budget actual.
 */
const TRANSFER_CATEGORIES = new Set(["Transfer", "Crypto Swap"]);

const CONTRIBUTION_CATEGORIES = new Set([
  "Savings",
  "Investments",
  "Crypto",
  "Crypto Investment",
  "Crypto Buy",
  "Contribution",
]);

const INCOME_CATEGORIES = new Set(["Business Income", "Interest", "Allowance"]);

/** Rows that aren't financial at all — a task note got into the table. */
const NON_FINANCIAL_CATEGORIES = new Set(["System Task"]);

export function isNonFinancialCategory(category: string | null | undefined): boolean {
  return category ? NON_FINANCIAL_CATEGORIES.has(category.trim()) : false;
}

export function inferTransactionType(
  category: string | null | undefined,
  amountZar: number | null | undefined,
  statedType?: string | null,
): TypeInference {
  if (statedType) {
    const normalised = statedType.trim().toLowerCase();
    if (
      normalised === "income" ||
      normalised === "expense" ||
      normalised === "transfer" ||
      normalised === "contribution"
    ) {
      return { type: normalised, confidence: "stated", reason: "Type field" };
    }
  }

  const clean = category?.trim() ?? "";

  if (TRANSFER_CATEGORIES.has(clean)) {
    return { type: "transfer", confidence: "high", reason: `Category is ${clean}` };
  }
  if (CONTRIBUTION_CATEGORIES.has(clean)) {
    return {
      type: "contribution",
      confidence: "high",
      reason: `Category is ${clean}`,
    };
  }
  if (INCOME_CATEGORIES.has(clean)) {
    return { type: "income", confidence: "high", reason: `Category is ${clean}` };
  }

  // Fall back to the amount sign. This is the weak rule: a positive amount in a
  // spending category is more likely a refund than salary, so it is marked low
  // confidence and surfaced rather than trusted silently.
  const amount = amountZar ?? 0;
  if (amount > 0) {
    return {
      type: "income",
      confidence: "low",
      reason: "Positive amount, no category rule",
    };
  }
  return {
    type: "expense",
    confidence: amount < 0 ? "high" : "low",
    reason: amount < 0 ? "Negative amount" : "No amount",
  };
}

/** Only expenses count toward budget spend (§3). */
export function countsAsSpend(type: TransactionType): boolean {
  return type === "expense";
}

/**
 * Category consolidation. The Transactions table has 48 categories with heavy
 * overlap (Petrol/Fuel, Eating Out/Restaurants/Takeaways/Food & Dining), while
 * Budget has 16. Mapping many-to-one here lets budget actuals be computed
 * without rewriting historical rows.
 */
export const CATEGORY_TO_BUDGET: Record<string, string> = {
  Groceries: "Groceries",
  "Meal Prep": "Meal Prep",

  Petrol: "Petrol",
  Fuel: "Petrol",
  Transport: "Petrol",

  "Eating Out": "Eating Out",
  Restaurants: "Eating Out",
  Takeaways: "Eating Out",
  "Food & Dining": "Eating Out",
  "Going Out": "Eating Out",

  Subscriptions: "Subscriptions",
  Cellphone: "Subscriptions",
  "Business Internet": "Internet",

  Kids: "Lisa & Liam",
  "Family & Kids": "Lisa & Liam",
  Activities: "Lisa & Liam",

  Bond: "Home Bond",
  "Home Loan": "Home Bond",

  "Municipal Rates": "Levies + Rates",
  "Business Levies": "Levies + Rates",
  Electricity: "Levies + Rates",
  Utilities: "Levies + Rates",
  "Home Maintenance": "Levies + Rates",

  Payflex: "Payflex",
  "Store Account Payments": "Payflex",
  "Debt Repayment": "Payflex",
  "Debt Payment": "Payflex",

  Medical: "Miscellaneous",
  Health: "Miscellaneous",
  Pharmacy: "Miscellaneous",
  Personal: "Miscellaneous",
  "Personal / Lifestyle": "Miscellaneous",
  "Clothing & Shoes": "Miscellaneous",
  "Betting/Lottery": "Miscellaneous",
  Smokes: "Miscellaneous",
  "Bank Fees": "Miscellaneous",
  "Digital Payments": "Miscellaneous",
  Miscellaneous: "Miscellaneous",
};

/** Null when a category has no budget line — surfaced, never silently dropped. */
export function budgetCategoryFor(category: string | null | undefined): string | null {
  if (!category) return null;
  return CATEGORY_TO_BUDGET[category.trim()] ?? null;
}
