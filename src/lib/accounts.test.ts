import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isNonAccount, resolveAccount, resolveByNetWorthName } from "./accounts.ts";

describe("resolveAccount", () => {
  it("maps every Capitec Main spelling seen in Transactions", () => {
    for (const alias of ["Capitec Main", "Capitec", "Main Account"]) {
      assert.equal(resolveAccount(alias)?.id, "capitec-main", alias);
    }
  });

  it("resolves TymeBank to GOtyme — they are one account", () => {
    // An earlier version kept these apart, reasoning from a row that read
    // "Payment to J LENG GoTyme Bank". That was a payment to someone else's
    // GoTyme account, not evidence of two accounts. Romano confirmed he holds
    // one account with them; the 151 TymeBank rows were merged on 2026-07-22.
    for (const alias of [
      "TymeBank",
      "Tyme Bank",
      "TymeBank EveryDay (51012204711)",
      "GOtyme Bank",
      "GOtyme",
    ]) {
      assert.equal(resolveAccount(alias)?.id, "gotyme", alias);
    }
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

  it("still excludes business money from personal safe-to-spend", () => {
    // GOtyme (which TymeBank now resolves to) is spendable; business is not.
    assert.equal(resolveAccount("TymeBank")?.spendable, true);
    assert.equal(resolveAccount("Capitec Business")?.spendable, false);
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
