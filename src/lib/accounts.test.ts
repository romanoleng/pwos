import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isNonAccount, resolveAccount, resolveByNetWorthName } from "./accounts.ts";

describe("resolveAccount", () => {
  it("maps every Capitec Main spelling seen in Transactions", () => {
    for (const alias of ["Capitec Main", "Capitec", "Main Account"]) {
      assert.equal(resolveAccount(alias)?.id, "capitec-main", alias);
    }
  });

  it("keeps TymeBank separate from GOtyme", () => {
    // A TymeBank row reads "Payment to J LENG GoTyme Bank" — money moving
    // between them, so they are different banks. Merging them would silently
    // combine two real balances into one wrong number.
    assert.equal(resolveAccount("TymeBank")?.id, "tymebank");
    assert.equal(resolveAccount("GOtyme Bank")?.id, "gotyme");
    assert.notEqual(resolveAccount("TymeBank")?.id, resolveAccount("GOtyme Bank")?.id);
  });

  it("is case and whitespace insensitive", () => {
    assert.equal(resolveAccount("  capitec  ")?.id, "capitec-main");
    assert.equal(resolveAccount("absa")?.id, "absa");
  });

  it("returns null for anything unrecognised rather than guessing", () => {
    assert.equal(resolveAccount("Nedbank"), null);
    assert.equal(resolveAccount(""), null);
    assert.equal(resolveAccount(null), null);
  });
});

describe("spendable accounts", () => {
  it("counts only Capitec Main and GOtyme, per the budget rule", () => {
    assert.equal(resolveAccount("Capitec Main")?.spendable, true);
    assert.equal(resolveAccount("GOtyme Bank")?.spendable, true);
  });

  it("excludes business money from personal safe-to-spend", () => {
    assert.equal(resolveAccount("Capitec Business")?.spendable, false);
  });

  it("excludes TymeBank because its balance is unknown", () => {
    // Treating an unrecorded balance as available money is the kind of
    // optimism that makes a wealth app dangerous.
    assert.equal(resolveAccount("TymeBank")?.spendable, false);
  });
});

describe("non-account rows", () => {
  it("excludes the System row that holds a task note", () => {
    assert.equal(isNonAccount("System"), true);
    assert.equal(isNonAccount("Capitec"), false);
  });
});

describe("resolveByNetWorthName", () => {
  it("links Net Worth rows to canonical accounts", () => {
    assert.equal(
      resolveByNetWorthName("Capitec Business (CreativeDigital)")?.id,
      "capitec-business",
    );
    assert.equal(resolveByNetWorthName("Absa (Romano)")?.id, "absa");
  });

  it("returns null for non-account Net Worth rows", () => {
    assert.equal(resolveByNetWorthName("Vehicle"), null);
    assert.equal(resolveByNetWorthName("Home Loan (Bond)"), null);
  });
});
