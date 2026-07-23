import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RECORD_TYPES, recordType, slugify, validateRecord } from "./records.ts";

describe("recordType", () => {
  it("resolves the declared kinds", () => {
    assert.equal(recordType("account")?.table, "accounts");
    assert.equal(recordType("kidAccount")?.table, "kids_accounts");
  });

  it("refuses anything not in the registry", () => {
    // The whole point of the allow-list: a client-supplied string must never
    // become a table name.
    assert.equal(recordType("transactions"), null);
    assert.equal(recordType("users; drop table accounts"), null);
    assert.equal(recordType(""), null);
  });
});

describe("validateRecord", () => {
  it("accepts a complete row", () => {
    const result = validateRecord(RECORD_TYPES.debt, {
      name: "Woolworths card",
      balance_zar: "1500.50",
      monthly_zar: "250",
    });
    assert.deepEqual(result, {
      values: { name: "Woolworths card", balance_zar: 1500.5, monthly_zar: 250 },
    });
  });

  it("requires the required fields", () => {
    const result = validateRecord(RECORD_TYPES.debt, { balance_zar: "100" });
    assert.deepEqual(result, { error: "Creditor is required." });
  });

  it("treats blank and whitespace as absent", () => {
    const result = validateRecord(RECORD_TYPES.debt, { name: "   ", balance_zar: "100" });
    assert.deepEqual(result, { error: "Creditor is required." });
  });

  it("keeps an optional blank as null rather than zero", () => {
    // NULL means "not known"; 0 would claim the balance is genuinely nothing.
    // spendable is a checkbox: absent means false, never null — an account is
    // either in the safe-to-spend set or it isn't.
    const result = validateRecord(RECORD_TYPES.account, {
      label: "Discovery", kind: "cash", balance_zar: "",
    });
    assert.deepEqual(result, {
      values: { label: "Discovery", kind: "cash", balance_zar: null, spendable: false },
    });
  });

  it("reads a ticked checkbox as true", () => {
    // FormData sends "on" for a checked box (the Tangem Visa case).
    const result = validateRecord(RECORD_TYPES.account, {
      label: "Tangem Visa", kind: "cash", balance_zar: "72", spendable: "on",
    });
    assert.deepEqual(result, {
      values: { label: "Tangem Visa", kind: "cash", balance_zar: 72, spendable: true },
    });
  });

  it("rejects a non-numeric amount", () => {
    const result = validateRecord(RECORD_TYPES.debt, { name: "X", balance_zar: "lots" });
    assert.deepEqual(result, { error: "Balance owed must be a number." });
  });

  it("catches an implausible amount", () => {
    // A fat-fingered extra zero is the realistic version of this mistake.
    const result = validateRecord(RECORD_TYPES.debt, { name: "X", balance_zar: "9999999999" });
    assert.deepEqual(result, { error: "Balance owed looks too large." });
  });

  it("rejects scientific notation rather than reading it as a number", () => {
    // Nobody types 1e12 into a money field; treating it as 1 000 000 000 000
    // would be a surprising interpretation of a typo.
    const result = validateRecord(RECORD_TYPES.debt, { name: "X", balance_zar: "1e12" });
    assert.deepEqual(result, { error: "Balance owed must be a number." });
  });

  it("rejects a select value that isn't offered", () => {
    const result = validateRecord(RECORD_TYPES.kidAccount, {
      child: "Someone else", account: "X", account_type: "Savings",
    });
    assert.deepEqual(result, { error: "Someone else isn't a valid whose." });
  });

  it("drops keys the registry never declared", () => {
    const result = validateRecord(RECORD_TYPES.debt, {
      name: "X", balance_zar: "1", archived: true, duplicate_of: 7,
    });
    assert.ok("values" in result);
    assert.deepEqual(Object.keys(result.values).sort(), ["balance_zar", "monthly_zar", "name"]);
  });
});

describe("slugify", () => {
  it("makes a readable id", () => {
    assert.equal(slugify("Discovery Bank"), "discovery-bank");
    assert.equal(slugify("Capitec  Main "), "capitec-main");
  });

  it("strips punctuation that would break an id", () => {
    assert.equal(slugify("Lisa & Liam's #1"), "lisa-liam-s-1");
  });

  it("never returns an empty id", () => {
    assert.equal(slugify("!!!"), "account");
    assert.equal(slugify(""), "account");
  });

  it("bounds the length", () => {
    assert.ok(slugify("a".repeat(200)).length <= 40);
  });
});
