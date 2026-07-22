import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupByChild, isKidInvestment, type KidAccountLike } from "./kids.ts";

const account = (
  child: string | null,
  account: string,
  accountType: string | null,
  balanceZar: number,
  monthlyZar = 0,
): KidAccountLike => ({ child, account, accountType, balanceZar, monthlyZar });

describe("isKidInvestment", () => {
  it("treats the three EasyEquities products as investments", () => {
    assert.equal(isKidInvestment("Retirement Annuity"), true);
    assert.equal(isKidInvestment("TFSA"), true);
    assert.equal(isKidInvestment("Investments"), true);
  });

  it("treats reachable cash as savings", () => {
    assert.equal(isKidInvestment("Savings"), false);
    assert.equal(isKidInvestment("32-Day Notice"), false);
  });

  it("falls back to savings when the type is missing", () => {
    // Understating what is invested is safer than implying locked-away money
    // is reachable.
    assert.equal(isKidInvestment(null), false);
    assert.equal(isKidInvestment(undefined), false);
    assert.equal(isKidInvestment(""), false);
  });

  it("does not match on a near miss", () => {
    assert.equal(isKidInvestment("investments"), false);
    assert.equal(isKidInvestment("Investment"), false);
  });
});

describe("groupByChild", () => {
  const accounts = [
    account("Liam", "TFSA", "TFSA", 382),
    account("Lisa", "Retirement Annuity", "Retirement Annuity", 1194, 100),
    account("Liam", "Retirement Annuity", "Retirement Annuity", 1300),
    account("Lisa", "EasyEquities ZAR", "Investments", 606, 500),
  ];

  it("groups per child and totals both balance and contributions", () => {
    const groups = groupByChild(accounts);
    assert.deepEqual(
      groups.map((g) => [g.child, g.balanceZar, g.monthlyZar]),
      [
        ["Liam", 1682, 0],
        ["Lisa", 1800, 600],
      ],
    );
  });

  it("orders children by name, not by balance", () => {
    // Liam totals less than Lisa but still comes first: a section that moves
    // when a balance changes is one you stop trusting.
    const groups = groupByChild(accounts);
    assert.deepEqual(groups.map((g) => g.child), ["Liam", "Lisa"]);
  });

  it("puts the largest balance first within a child", () => {
    const [liam] = groupByChild(accounts);
    assert.deepEqual(liam.accounts.map((a) => a.account), ["Retirement Annuity", "TFSA"]);
  });

  it("keeps an unassigned account rather than dropping it", () => {
    const groups = groupByChild([...accounts, account(null, "Orphan", "TFSA", 50)]);
    const unassigned = groups.find((g) => g.child === "Unassigned");
    assert.equal(unassigned?.balanceZar, 50);
  });

  it("treats blank whitespace as unassigned", () => {
    const groups = groupByChild([account("   ", "Orphan", "TFSA", 50)]);
    assert.deepEqual(groups.map((g) => g.child), ["Unassigned"]);
  });
});
