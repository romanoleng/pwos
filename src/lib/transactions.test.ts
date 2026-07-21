import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  budgetCategoryFor,
  countsAsSpend,
  inferTransactionType,
  hasSignAnomaly,
  isNonFinancialCategory,
} from "./transactions.ts";

describe("inferTransactionType", () => {
  it("prefers a stated Type field over any inference", () => {
    // Once the Type field exists it must win, even against a contrary category.
    const result = inferTransactionType("Groceries", -500, "transfer");
    assert.equal(result.type, "transfer");
    assert.equal(result.confidence, "stated");
  });

  it("treats Category=Transfer as a transfer, whatever the sign", () => {
    // 29 of every 100 rows are these. If they counted as spend, every budget
    // would be inflated.
    assert.equal(inferTransactionType("Transfer", -1400).type, "transfer");
    assert.equal(inferTransactionType("Transfer", 3895).type, "transfer");
  });

  it("treats crypto and savings categories as contributions, not spend", () => {
    for (const category of [
      "Crypto Investment",
      "Crypto Buy",
      "Investments",
      "Savings",
    ]) {
      const result = inferTransactionType(category, -500);
      assert.equal(result.type, "contribution", category);
    }
  });

  it("recognises income categories", () => {
    assert.equal(inferTransactionType("Business Income", 3000).type, "income");
    assert.equal(inferTransactionType("Interest", 12).type, "income");
  });

  it("falls back to the amount sign only for unrecognised categories", () => {
    // Known spending categories are handled by category, not sign — see the
    // "category beats amount sign" suite. The sign rule is the last resort for
    // a category no rule covers, and is marked low confidence when positive
    // because a refund is as likely as income.
    const positive = inferTransactionType("Something Unmapped", 250);
    assert.equal(positive.type, "income");
    assert.equal(positive.confidence, "low");

    const negative = inferTransactionType("Something Unmapped", -250);
    assert.equal(negative.type, "expense");
    assert.equal(negative.confidence, "high");
  });
});

describe("countsAsSpend", () => {
  it("counts only expenses", () => {
    assert.equal(countsAsSpend("expense"), true);
    assert.equal(countsAsSpend("transfer"), false);
    assert.equal(countsAsSpend("contribution"), false);
    assert.equal(countsAsSpend("income"), false);
  });
});

describe("isNonFinancialCategory", () => {
  it("excludes the System Task row", () => {
    assert.equal(isNonFinancialCategory("System Task"), true);
    assert.equal(isNonFinancialCategory("Groceries"), false);
  });
});

describe("budgetCategoryFor", () => {
  it("consolidates duplicate categories onto one budget line", () => {
    assert.equal(budgetCategoryFor("Petrol"), "Petrol");
    assert.equal(budgetCategoryFor("Fuel"), "Petrol");
    for (const category of ["Eating Out", "Restaurants", "Takeaways", "Food & Dining"]) {
      assert.equal(budgetCategoryFor(category), "Eating Out", category);
    }
    assert.equal(budgetCategoryFor("Bond"), "Home Bond");
    assert.equal(budgetCategoryFor("Home Loan"), "Home Bond");
  });

  it("returns null for unmapped categories rather than guessing a bucket", () => {
    // An unmapped category must surface, not quietly land in Miscellaneous.
    assert.equal(budgetCategoryFor("Transfer"), null);
    assert.equal(budgetCategoryFor("Something New"), null);
    assert.equal(budgetCategoryFor(null), null);
  });
});

describe("category beats amount sign", () => {
  it("types a positive-amount grocery row as expense, not income", () => {
    // Live data: "Checkers groceries" R1335 positive, "Petrol — Total/BP" R500
    // positive. These are entry slips, not income. Trusting the sign would move
    // ~R3 500 of real spending onto the wrong side of the budget.
    const result = inferTransactionType("Groceries", 1335);
    assert.equal(result.type, "expense");
    assert.equal(result.confidence, "high");
    assert.match(result.reason, /sign looks wrong/);
  });

  it("still types genuine income categories as income", () => {
    assert.equal(inferTransactionType("Business Income", 3000).type, "income");
  });

  it("leaves transfers alone whatever the sign", () => {
    assert.equal(inferTransactionType("Transfer", 3895).type, "transfer");
  });
});

describe("hasSignAnomaly", () => {
  it("flags a spending category with money coming in", () => {
    assert.equal(hasSignAnomaly("Groceries", 1335), true);
    assert.equal(hasSignAnomaly("Smokes", 84), true);
  });

  it("flags an income category with money going out", () => {
    assert.equal(hasSignAnomaly("Business Income", -500), true);
  });

  it("does not flag correctly signed rows", () => {
    assert.equal(hasSignAnomaly("Groceries", -493), false);
    assert.equal(hasSignAnomaly("Business Income", 3895), false);
  });

  it("does not flag transfers, which legitimately go both ways", () => {
    assert.equal(hasSignAnomaly("Transfer", 3895), false);
    assert.equal(hasSignAnomaly("Transfer", -1400), false);
  });
});
