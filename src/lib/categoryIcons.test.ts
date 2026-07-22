import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Tag } from "lucide-react";

import { iconForCategory } from "./categoryIcons.ts";

describe("iconForCategory", () => {
  it("maps every live category to something other than the fallback", () => {
    // The real category list — each should have a deliberate icon.
    const live = [
      "Groceries", "Petrol", "Eating Out", "Subscriptions", "Lisa & Liam",
      "Home Bond", "Levies + Rates", "Payflex", "Internet", "Meal Prep",
      "Medical", "Clothing & Shoes", "Cigarettes", "Betting/Lottery",
      "Bank Fees", "Electricity", "Kiosk Shop", "PayJustNow", "Debt Review",
      "Business Income", "Interest", "Allowance", "Transfer", "Savings",
      "Investments", "Crypto Investment", "Crypto DCA", "Car Savings",
      "Tax Provision → SARS", "Emergency Fund", "Kids Education (TFSA)",
    ];
    const unmapped = live.filter((name) => iconForCategory(name) === Tag);
    assert.deepEqual(unmapped, []);
  });

  it("survives renames that keep the keyword", () => {
    assert.equal(iconForCategory("Grocery runs"), iconForCategory("Groceries"));
  });

  it("falls back to the tag rather than crashing", () => {
    assert.notEqual(iconForCategory("Something brand new"), undefined);
    assert.equal(iconForCategory(null), Tag);
    assert.equal(iconForCategory("Miscellaneous"), Tag);
  });
});
