import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  budgetCategoryFor,
  countsAsSpend,
  inferTransactionType,
  hasSignAnomaly,
  isNonFinancialCategory,
  spendContribution,
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

describe("ambiguous debt categories resolve by description", () => {
  // Real rows from one cycle, all categorised "Debt Repayment":
  //   R10 000 "Bond payment — ABSA to Hound Bond"
  //   R2 519  "Payflex monthly payment"
  //   R500    "Debt review payment — Anders MbD"
  // Mapping the category straight to Payflex put the bond in the wrong line.
  it("routes a bond payment to Home Bond, not Payflex", () => {
    assert.equal(
      budgetCategoryFor("Debt Repayment", "Bond payment — ABSA to Hound Bond"),
      "Home Bond",
    );
  });

  it("routes a Payflex instalment to Payflex", () => {
    assert.equal(
      budgetCategoryFor("Debt Repayment", "Payflex monthly payment"),
      "Payflex",
    );
  });

  it("leaves PayJustNow unbudgeted rather than inflating Payflex", () => {
    assert.equal(
      budgetCategoryFor("Store Account Payments", "Pay Just Now monthly payment"),
      null,
    );
  });

  it("leaves the debt review unbudgeted", () => {
    assert.equal(
      budgetCategoryFor("Debt Repayment", "Debt review payment — Anders MbD"),
      null,
    );
  });

  it("returns null when the description gives no clue", () => {
    assert.equal(budgetCategoryFor("Debt Repayment", "monthly payment"), null);
    assert.equal(budgetCategoryFor("Debt Repayment", undefined), null);
  });

  it("does not let description override an unambiguous category", () => {
    // "Groceries" is unambiguous; a stray word in the description must not
    // redirect it.
    assert.equal(budgetCategoryFor("Groceries", "bond street market"), "Groceries");
  });
});

describe("spendContribution", () => {
  it("counts a normally-signed expense as positive spend", () => {
    assert.equal(spendContribution(-493, "Groceries", "Checkers Sixty60"), 493);
  });

  it("lets a genuine refund reduce spend", () => {
    assert.equal(
      spendContribution(508.47, "Groceries", "Reversal - Purchase at Pick n Pay Asap"),
      -508.47,
    );
  });

  it("still counts a mis-signed expense as spend", () => {
    // Negating this made Groceries read R-1 154 — negative spending, which
    // silently understated the budget.
    assert.equal(spendContribution(1335, "Groceries", "Checkers groceries"), 1335);
    assert.equal(spendContribution(500, "Fuel", "Petrol — Total/BP"), 500);
  });

  it("does not treat a positive transfer as spend at all", () => {
    // Transfers never reach this function, but the sign rule must not claim
    // them if they ever did.
    assert.equal(spendContribution(3895, "Transfer", "PayShap received"), -3895);
  });
});
