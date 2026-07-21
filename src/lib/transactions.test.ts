import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  budgetCategoryFor,
  countsAsSpend,
  inferTransactionType,
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

  it("falls back to the amount sign, flagged as low confidence", () => {
    // A positive amount in a spending category is more likely a refund than
    // salary, so this must not be trusted silently.
    const positive = inferTransactionType("Groceries", 250);
    assert.equal(positive.type, "income");
    assert.equal(positive.confidence, "low");

    const negative = inferTransactionType("Groceries", -250);
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
