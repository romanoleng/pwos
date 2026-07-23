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
    contributions: [],
    availableContributions: [],
    unbudgetedZar: 0,
    unbudgetedCategories: [],
    dailyAllowanceZar: null,
    availableCategories: [],
    cycleStart: null,
    blankStart: null,
    plan: {
      expectedIncomeZar: 0, receivedIncomeZar: 0, allocatedZar: 0,
      puttingAwayZar: 0, unallocatedZar: 0,
    },
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

describe("getBudgetCycle with anchors", () => {
  // Romano is paid by clients, not payroll: 24 Feb, 24 Mar, 23 Apr, 22 May,
  // 24 Jun. Close to the 24th, never reliably on it.
  const ANCHORS = ["2026-02-24", "2026-03-24", "2026-04-23", "2026-05-22", "2026-06-24"];
  const at = (iso: string) => new Date(`${iso}T09:00:00+02:00`);

  it("starts the cycle the day the money actually landed", () => {
    const cycle = getBudgetCycle(at("2026-05-25"), ANCHORS);
    assert.equal(cycle.start, "2026-05-22");
    assert.equal(cycle.end, "2026-06-24");
  });

  it("runs an open cycle to where payday would nominally fall", () => {
    // 24 Jun is the newest anchor; July's payment isn't logged yet.
    const cycle = getBudgetCycle(at("2026-07-22"), ANCHORS);
    assert.equal(cycle.start, "2026-06-24");
    assert.equal(cycle.end, "2026-07-24");
    assert.equal(cycle.remainingDays, 2);
  });

  it("rolls over on the anchor day itself", () => {
    assert.equal(getBudgetCycle(at("2026-05-21"), ANCHORS).start, "2026-04-23");
    assert.equal(getBudgetCycle(at("2026-05-22"), ANCHORS).start, "2026-05-22");
  });

  it("ignores a mid-cycle top-up that was never anchored", () => {
    // R15 800 arrived 15 June, three weeks into the May cycle. Inferring the
    // cycle from income size would have wrongly restarted it here.
    assert.equal(getBudgetCycle(at("2026-06-16"), ANCHORS).start, "2026-05-22");
  });

  it("falls back to the 24th before any anchor exists", () => {
    assert.equal(getBudgetCycle(at("2026-01-10"), ANCHORS).start, "2025-12-24");
  });

  it("matches the nominal cycle when there are no anchors at all", () => {
    const withAnchors = getBudgetCycle(at("2026-07-22"), []);
    const nominal = getBudgetCycle(at("2026-07-22"));
    assert.deepEqual(withAnchors, nominal);
  });

  it("is unaffected by duplicate or unsorted anchors", () => {
    const messy = ["2026-06-24", "2026-02-24", "2026-06-24", "2026-05-22"];
    assert.equal(getBudgetCycle(at("2026-07-22"), messy).start, "2026-06-24");
  });

  it("names the cycle for the month it ends in", () => {
    assert.equal(getBudgetCycle(at("2026-07-22"), ANCHORS).budgetMonth, "2026-07-01");
  });
});
