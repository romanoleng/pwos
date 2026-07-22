import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPeriodKind, periodDays, resolvePeriod, type CycleBounds } from "./period.ts";

// 2026-07-22 is a Wednesday. The cycle in progress started 24 June.
const TODAY = "2026-07-22";
const CYCLE: CycleBounds = {
  start: "2026-06-24",
  end: "2026-07-24",
  previousStart: "2026-05-22",
};

describe("resolvePeriod", () => {
  it("ends a range on tomorrow so today is included", () => {
    // The end is exclusive; using today would silently drop today's spending.
    assert.equal(resolvePeriod("mtd", TODAY, CYCLE).end, "2026-07-23");
  });

  it("gives month to date from the 1st", () => {
    const period = resolvePeriod("mtd", TODAY, CYCLE);
    assert.equal(period.start, "2026-07-01");
    assert.equal(periodDays(period), 22);
  });

  it("starts the week on Monday", () => {
    assert.equal(resolvePeriod("week", TODAY, CYCLE).start, "2026-07-20");
  });

  it("treats Sunday as the end of its week, not the start", () => {
    // A Sunday-start week splits the weekend across two periods.
    assert.equal(resolvePeriod("week", "2026-07-26", CYCLE).start, "2026-07-20");
    assert.equal(resolvePeriod("week", "2026-07-27", CYCLE).start, "2026-07-27");
  });

  it("cuts an in-progress cycle at today rather than its end date", () => {
    const period = resolvePeriod("cycle", TODAY, CYCLE);
    assert.equal(period.start, "2026-06-24");
    assert.equal(period.end, "2026-07-23");
  });

  it("uses the full range for a cycle that has already closed", () => {
    const period = resolvePeriod("cycle", "2026-08-01", CYCLE);
    assert.equal(period.end, "2026-07-24");
  });

  it("ends the previous cycle exactly where this one starts", () => {
    // Half-open ranges: no day belongs to both, and no day falls between them.
    const previous = resolvePeriod("lastCycle", TODAY, CYCLE);
    const current = resolvePeriod("cycle", TODAY, CYCLE);
    assert.equal(previous.end, current.start);
    assert.equal(previous.start, "2026-05-22");
  });

  it("falls back to this cycle when there is no previous one", () => {
    const period = resolvePeriod("lastCycle", TODAY, { ...CYCLE, previousStart: null });
    assert.equal(period.start, "2026-06-24");
  });

  it("counts last 30 days inclusive of today", () => {
    const period = resolvePeriod("last30", TODAY, CYCLE);
    assert.equal(period.start, "2026-06-23");
    assert.equal(periodDays(period), 30);
  });

  it("counts last 7 days inclusive of today", () => {
    assert.equal(periodDays(resolvePeriod("last7", TODAY, CYCLE)), 7);
  });

  it("leaves 'all' unbounded at the start", () => {
    const period = resolvePeriod("all", TODAY, CYCLE);
    assert.equal(period.start, null);
    assert.equal(periodDays(period), null);
  });

  it("crosses a month boundary without drifting", () => {
    const period = resolvePeriod("last30", "2026-03-05", CYCLE);
    assert.equal(period.start, "2026-02-04");
    assert.equal(periodDays(period), 30);
  });

  it("handles a leap day", () => {
    const period = resolvePeriod("mtd", "2028-02-29", CYCLE);
    assert.equal(period.start, "2028-02-01");
    assert.equal(period.end, "2028-03-01");
    assert.equal(periodDays(period), 29);
  });
});

describe("isPeriodKind", () => {
  it("accepts the known kinds", () => {
    assert.equal(isPeriodKind("mtd"), true);
    assert.equal(isPeriodKind("cycle"), true);
  });

  it("rejects anything else, so a URL can't inject a range", () => {
    assert.equal(isPeriodKind("year"), false);
    assert.equal(isPeriodKind(""), false);
    assert.equal(isPeriodKind(null), false);
    assert.equal(isPeriodKind(undefined), false);
  });
});
