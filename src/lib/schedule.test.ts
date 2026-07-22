import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addMonthsClamped, expandSchedule, splitInstalments } from "./schedule.ts";

describe("addMonthsClamped", () => {
  it("keeps payday on the 24th through every month", () => {
    assert.equal(addMonthsClamped("2026-07-24", 1), "2026-08-24");
    assert.equal(addMonthsClamped("2026-07-24", 7), "2027-02-24");
  });

  it("clamps the 31st per month without sticking", () => {
    assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonthsClamped("2026-01-31", 2), "2026-03-31");
    assert.equal(addMonthsClamped("2026-01-31", 3), "2026-04-30");
  });

  it("knows February in a leap year", () => {
    assert.equal(addMonthsClamped("2028-01-31", 1), "2028-02-29");
  });

  it("crosses year ends", () => {
    assert.equal(addMonthsClamped("2026-11-15", 3), "2027-02-15");
    assert.equal(addMonthsClamped("2026-12-31", 1), "2027-01-31");
  });
});

describe("splitInstalments", () => {
  it("reconciles to the cent, remainder on the first", () => {
    assert.deepEqual(splitInstalments(100, 3), [33.34, 33.33, 33.33]);
    const sum = splitInstalments(100, 3).reduce((t, v) => t + v, 0);
    assert.equal(Math.round(sum * 100), 10000);
  });

  it("splits a clean total cleanly", () => {
    assert.deepEqual(splitInstalments(1200, 6), [200, 200, 200, 200, 200, 200]);
  });

  it("survives awkward cent totals", () => {
    const parts = splitInstalments(999.99, 7);
    const sum = parts.reduce((t, v) => t + v, 0);
    assert.equal(Math.round(sum * 100), 99999);
    // Every later instalment is identical — only the first differs.
    assert.equal(new Set(parts.slice(1)).size, 1);
  });
});

describe("expandSchedule", () => {
  it("repeat: same amount, same description, monthly dates", () => {
    const entries = expandSchedule({
      schedule: { mode: "repeat", months: 3 },
      startDate: "2026-07-24",
      amountZar: 48100,
      description: "Natroceutics",
    });
    assert.equal(entries.length, 3);
    assert.deepEqual(
      entries.map((e) => e.date),
      ["2026-07-24", "2026-08-24", "2026-09-24"],
    );
    assert.ok(entries.every((e) => e.amountZar === 48100));
    assert.ok(entries.every((e) => e.description === "Natroceutics"));
  });

  it("instalment: split total, numbered descriptions", () => {
    const entries = expandSchedule({
      schedule: { mode: "instalment", months: 3 },
      startDate: "2026-07-22",
      amountZar: 1000,
      description: "Takealot",
    });
    assert.deepEqual(
      entries.map((e) => e.amountZar),
      [333.34, 333.33, 333.33],
    );
    assert.deepEqual(
      entries.map((e) => e.description),
      ["Takealot (1/3)", "Takealot (2/3)", "Takealot (3/3)"],
    );
  });

  it("rejects out-of-range month counts", () => {
    assert.throws(() =>
      expandSchedule({
        schedule: { mode: "repeat", months: 1 },
        startDate: "2026-07-22",
        amountZar: 100,
        description: "x",
      }),
    );
    assert.throws(() =>
      expandSchedule({
        schedule: { mode: "instalment", months: 25 },
        startDate: "2026-07-22",
        amountZar: 100,
        description: "x",
      }),
    );
  });
});
