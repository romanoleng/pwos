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

/**
 * Categories that are unambiguously spending.
 *
 * These beat the amount sign, because the live data contains expenses entered
 * with a positive amount — "Petrol — Total/BP" at R500, "Checkers groceries"
 * at R1 335, "Smokes — 2 packs" at R84. Trusting the sign there would type a
 * dozen real expenses as income and quietly move ~R3 500 of spending onto the
 * wrong side of the budget.
 *
 * The sign anomaly is reported separately (see `hasSignAnomaly`) so the
 * underlying data can be corrected rather than silently worked around.
 */
const EXPENSE_CATEGORIES = new Set([
  "Groceries",
  "Petrol",
  "Fuel",
  "Transport",
  "Eating Out",
  "Restaurants",
  "Takeaways",
  "Food & Dining",
  "Going Out",
  "Subscriptions",
  "Cellphone",
  "Business Internet",
  "Kids",
  "Family & Kids",
  "Activities",
  "Electricity",
  "Utilities",
  "Municipal Rates",
  "Business Levies",
  "Home Maintenance",
  "Bond",
  "Home Loan",
  "Debt Repayment",
  "Debt Payment",
  "Store Account Payments",
  "Medical",
  "Health",
  "Pharmacy",
  "Personal",
  "Personal / Lifestyle",
  "Clothing & Shoes",
  "Betting/Lottery",
  "Smokes",
  "Bank Fees",
  "Digital Payments",
  "Miscellaneous",
  "Meal Prep",
]);

/**
 * True when a row's amount sign contradicts its category — a spending category
 * with money coming in, or an income category with money going out. Almost
 * always a data-entry slip, occasionally a genuine refund, so it is surfaced
 * for review rather than corrected automatically.
 */
export function hasSignAnomaly(
  category: string | null | undefined,
  amountZar: number | null | undefined,
): boolean {
  const clean = category?.trim() ?? "";
  const amount = amountZar ?? 0;
  if (amount === 0) return false;
  if (EXPENSE_CATEGORIES.has(clean) && amount > 0) return true;
  if (INCOME_CATEGORIES.has(clean) && amount < 0) return true;
  return false;
}

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
  // Category beats sign: see EXPENSE_CATEGORIES for why.
  if (EXPENSE_CATEGORIES.has(clean)) {
    return {
      type: "expense",
      confidence: "high",
      reason:
        (amountZar ?? 0) > 0
          ? `Category is ${clean} (amount is positive — sign looks wrong)`
          : `Category is ${clean}`,
    };
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
