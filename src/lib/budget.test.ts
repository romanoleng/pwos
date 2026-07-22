import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBudgetCycle, isInCycle, spendPace } from "./budget.ts";

describe("getBudgetCycle", () => {
  it("matches the cycle Airtable already records", () => {
    // Finance Live State holds Cycle Start 2026-06-24, Cycle End 2026-07-24.
    // Today (21 Jul) sits inside it.
    const cycle = getBudgetCycle(new Date("2026-07-21T10:00:00Z"));
    assert.equal(cycle.start, "2026-06-24");
    assert.equal(cycle.end, "2026-07-24");
    assert.equal(cycle.totalDays, 30);
    assert.equal(cycle.elapsedDays, 27);
    assert.equal(cycle.remainingDays, 3);
  });

  it("rolls to the new cycle on payday itself", () => {
    // Payday money funds the month ahead, so the 24th starts the new cycle
    // rather than closing the old one.
    const cycle = getBudgetCycle(new Date("2026-07-24T08:00:00Z"));
    assert.equal(cycle.start, "2026-07-24");
    assert.equal(cycle.end, "2026-08-24");
    assert.equal(cycle.elapsedDays, 0);
  });

  it("stays in the old cycle the day before payday", () => {
    const cycle = getBudgetCycle(new Date("2026-07-23T08:00:00Z"));
    assert.equal(cycle.start, "2026-06-24");
    assert.equal(cycle.end, "2026-07-24");
    assert.equal(cycle.remainingDays, 1);
  });

  it("uses the Johannesburg date, not the UTC one", () => {
    // 23:30 UTC on the 23rd is 01:30 on the 24th in SAST — already payday.
    // Deriving from UTC would keep the old cycle open two hours too long.
    const cycle = getBudgetCycle(new Date("2026-07-23T23:30:00Z"));
    assert.equal(cycle.start, "2026-07-24");
  });

  it("crosses the year boundary", () => {
    const cycle = getBudgetCycle(new Date("2027-01-05T10:00:00Z"));
    assert.equal(cycle.start, "2026-12-24");
    assert.equal(cycle.end, "2027-01-24");
  });

  it("names the cycle for the month it ends in", () => {
    // 24 Jun → 24 Jul is the July budget, matching how the Budget table is
    // already filled in (Month = 2026-07-01).
    assert.equal(getBudgetCycle(new Date("2026-07-21T10:00:00Z")).budgetMonth, "2026-07-01");
    assert.equal(getBudgetCycle(new Date("2026-07-25T10:00:00Z")).budgetMonth, "2026-08-01");
  });

  it("handles February, which is shorter than a payday gap", () => {
    const cycle = getBudgetCycle(new Date("2027-03-01T10:00:00Z"));
    assert.equal(cycle.start, "2027-02-24");
    assert.equal(cycle.end, "2027-03-24");
  });
});

describe("isInCycle", () => {
  const cycle = getBudgetCycle(new Date("2026-07-21T10:00:00Z"));

  it("includes the start date and excludes the end date", () => {
    assert.equal(isInCycle("2026-06-24", cycle), true);
    assert.equal(isInCycle("2026-07-23", cycle), true);
    // The 24th belongs to the next cycle, not this one — otherwise payday
    // transactions would be counted twice.
    assert.equal(isInCycle("2026-07-24", cycle), false);
    assert.equal(isInCycle("2026-06-23", cycle), false);
  });

  it("tolerates a full timestamp", () => {
    assert.equal(isInCycle("2026-07-01T14:22:00.000Z", cycle), true);
  });

  it("is false for a missing date rather than throwing", () => {
    assert.equal(isInCycle(null, cycle), false);
    assert.equal(isInCycle("", cycle), false);
  });
});

describe("spendPace", () => {
  const base = {
    cycle: getBudgetCycle(new Date("2026-07-21T10:00:00Z")), // 27 of 30 days
    lines: [],
    unbudgetedZar: 0,
    unbudgetedCategories: [],
    dailyAllowanceZar: null,
    availableCategories: [],
  };

  it("returns 1 when spending tracks the calendar exactly", () => {
    const pace = spendPace({
      ...base,
      totals: { budgetedZar: 1000, actualZar: 900, remainingZar: 100, incomeZar: 0 },
    });
    // 90% of budget at 90% through the cycle.
    assert.ok(pace !== null && Math.abs(pace - 1) < 0.01);
  });

  it("returns above 1 when overspending relative to time", () => {
    const pace = spendPace({
      ...base,
      totals: { budgetedZar: 1000, actualZar: 1000, remainingZar: 0, incomeZar: 0 },
    });
    assert.ok(pace !== null && pace > 1);
  });

  it("returns null with nothing budgeted, rather than dividing by zero", () => {
    const pace = spendPace({
      ...base,
      totals: { budgetedZar: 0, actualZar: 500, remainingZar: -500, incomeZar: 0 },
    });
    assert.equal(pace, null);
  });
});
