import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidAmount, parseAmount } from "./amount.ts";

describe("parseAmount", () => {
  it("reads the comma decimal Romano actually types", () => {
    // The bug this exists to fix: "50,50" in a number input yielded nothing.
    assert.equal(parseAmount("50,50"), 50.5);
    assert.equal(parseAmount("0,99"), 0.99);
    assert.equal(parseAmount("1234,05"), 1234.05);
  });

  it("still reads a full stop", () => {
    assert.equal(parseAmount("50.50"), 50.5);
    assert.equal(parseAmount("1234.05"), 1234.05);
  });

  it("handles en-ZA thousands spacing", () => {
    assert.equal(parseAmount("1 234,56"), 1234.56);
    assert.equal(parseAmount("1 234 567,89"), 1234567.89);
    // Intl emits a narrow no-break space, not a plain one.
    assert.equal(parseAmount("1 234,56"), 1234.56);
  });

  it("takes the rightmost separator as the decimal one", () => {
    assert.equal(parseAmount("1,234.56"), 1234.56); // US
    assert.equal(parseAmount("1.234,56"), 1234.56); // European
  });

  it("accepts a leading rand sign", () => {
    assert.equal(parseAmount("R50,50"), 50.5);
    assert.equal(parseAmount("r 1 000"), 1000);
  });

  it("keeps whole numbers whole", () => {
    assert.equal(parseAmount("500"), 500);
    assert.equal(parseAmount("0"), 0);
  });

  it("handles negatives", () => {
    assert.equal(parseAmount("-50,50"), -50.5);
  });

  it("returns null rather than guessing at nonsense", () => {
    // Silently reading "12ab" as 12 would write a wrong figure to the ledger.
    assert.equal(parseAmount("12ab"), null);
    assert.equal(parseAmount("abc"), null);
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount("   "), null);
    assert.equal(parseAmount(","), null);
    assert.equal(parseAmount("."), null);
    assert.equal(parseAmount(null), null);
    assert.equal(parseAmount(undefined), null);
  });

  it("passes numbers through", () => {
    assert.equal(parseAmount(42.5), 42.5);
    assert.equal(parseAmount(Number.NaN), null);
    assert.equal(parseAmount(Number.POSITIVE_INFINITY), null);
  });

  it("reads a trailing separator as a whole number", () => {
    assert.equal(parseAmount("50,"), 50);
    assert.equal(parseAmount("50."), 50);
  });

  it("round-trips what the app itself formats", () => {
    const formatted = new Intl.NumberFormat("en-ZA", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(1234567.89);
    assert.equal(parseAmount(formatted), 1234567.89);
  });
});

describe("isValidAmount", () => {
  it("treats blank as valid, since not every field is required", () => {
    assert.equal(isValidAmount(""), true);
    assert.equal(isValidAmount("  "), true);
  });

  it("accepts both separators and rejects rubbish", () => {
    assert.equal(isValidAmount("50,50"), true);
    assert.equal(isValidAmount("50.50"), true);
    assert.equal(isValidAmount("50ab"), false);
  });
});
