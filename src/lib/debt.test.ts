import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findDuplicates, payoffOrder, type DebtRow } from "./debt.ts";

const debt = (name: string, balanceZar: number, over: Partial<DebtRow> = {}): DebtRow => ({
  recordId: `rec${normaliseId(name)}`,
  name,
  type: null,
  balanceZar,
  monthlyZar: 0,
  interestPct: null,
  priority: null,
  status: "Active",
  payoffDate: null,
  ...over,
});
function normaliseId(name: string) {
  return name.replace(/[^A-Za-z0-9]/g, "").padEnd(14, "x").slice(0, 14);
}

describe("findDuplicates", () => {
  it("does not flag separate creditors with similar-sounding names", () => {
    // Anders, MBD Legal and SCM read like one debt review entered three times,
    // and an earlier version grouped them. Romano confirmed they are three
    // real creditors — flagging correct data as suspect is worse than silence.
    const groups = findDuplicates([
      debt("Anders", 160_345),
      debt("MBD Legal", 160_745),
      debt("SCM", 500),
      debt("Home Loan (Bond)", 974_932),
    ]);
    assert.equal(groups.length, 0);
  });

  it("catches the same name spelled differently", () => {
    const groups = findDuplicates([
      debt("Pay Just Now", 6_800),
      debt("PayJustNow", 6_800),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].countedZar, 13_600);
    assert.equal(groups[0].dedupedZar, 6_800);
  });

  it("leaves genuinely distinct debts alone", () => {
    // Payflex and PayJustNow are different creditors despite similar names.
    const groups = findDuplicates([
      debt("Payflex", 7_200),
      debt("PayJustNow", 6_800),
      debt("Home Loan (Bond)", 974_932),
    ]);
    assert.equal(groups.length, 0);
  });
});

describe("payoffOrder", () => {
  it("puts the highest interest rate first", () => {
    const order = payoffOrder([
      debt("Bond", 974_932, { interestPct: 11 }),
      debt("Card", 5_000, { interestPct: 22 }),
      debt("Loan", 20_000, { interestPct: 15 }),
    ]);
    assert.deepEqual(order.map((d) => d.name), ["Card", "Loan", "Bond"]);
  });

  it("breaks ties on the smaller balance, so something clears sooner", () => {
    const order = payoffOrder([
      debt("Big", 50_000, { interestPct: 10 }),
      debt("Small", 1_000, { interestPct: 10 }),
    ]);
    assert.deepEqual(order.map((d) => d.name), ["Small", "Big"]);
  });

  it("does not mutate the input", () => {
    const rows = [debt("A", 1), debt("B", 2)];
    payoffOrder(rows);
    assert.deepEqual(rows.map((d) => d.name), ["A", "B"]);
  });
});
