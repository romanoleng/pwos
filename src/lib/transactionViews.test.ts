import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calendarWeeks, groupByDay, groupByMonth, monthsPresent, summariseCategories,
  type ViewRow,
} from "./transactionViews.ts";

const row = (
  date: string | null, amountZar: number, type: string, category: string | null = null,
): ViewRow => ({ recordId: `${date}-${amountZar}`, date, amountZar, category, type });

const ROWS: ViewRow[] = [
  row("2026-07-22", -100, "expense", "Groceries"),
  row("2026-07-22", -50, "expense", "Petrol"),
  row("2026-07-22", 5000, "income", "Business Income"),
  row("2026-07-20", -30, "expense", "Groceries"),
  row("2026-06-30", -200, "expense", null),
  row("2026-06-24", -1000, "transfer", "Transfer"),
];

describe("groupByDay", () => {
  it("totals income and spend per day, newest first", () => {
    const days = groupByDay(ROWS);
    assert.deepEqual(days.map((d) => d.date), ["2026-07-22", "2026-07-20", "2026-06-30", "2026-06-24"]);
    assert.equal(days[0].incomeZar, 5000);
    assert.equal(days[0].expenseZar, 150);
    assert.equal(days[0].netZar, 4850);
  });

  it("leaves transfers out of both totals", () => {
    // Moving money between your own accounts is neither earning nor spending.
    const day = groupByDay(ROWS).find((d) => d.date === "2026-06-24");
    assert.equal(day?.incomeZar, 0);
    assert.equal(day?.expenseZar, 0);
    assert.equal(day?.rows.length, 1);
  });

  it("drops undated rows rather than inventing a day for them", () => {
    const days = groupByDay([...ROWS, row(null, -10, "expense")]);
    assert.equal(days.reduce((t, d) => t + d.rows.length, 0), ROWS.length);
  });
});

describe("groupByMonth", () => {
  it("aggregates per month, newest first", () => {
    const months = groupByMonth(ROWS);
    assert.deepEqual(months.map((m) => m.month), ["2026-07", "2026-06"]);
    assert.equal(months[0].expenseZar, 180);
    assert.equal(months[0].incomeZar, 5000);
    assert.equal(months[1].count, 2);
  });
});

describe("summariseCategories", () => {
  it("ranks spend by category with shares that total 100", () => {
    const shares = summariseCategories(ROWS);
    assert.deepEqual(shares.map((s) => s.category), ["Uncategorised", "Groceries", "Petrol"]);
    assert.equal(shares.find((s) => s.category === "Groceries")?.spentZar, 130);
    assert.equal(Math.round(shares.reduce((t, s) => t + s.sharePct, 0)), 100);
  });

  it("ignores income and transfers", () => {
    const total = summariseCategories(ROWS).reduce((t, s) => t + s.spentZar, 0);
    assert.equal(total, 380);
  });

  it("returns nothing rather than dividing by zero", () => {
    assert.deepEqual(summariseCategories([row("2026-07-01", 100, "income")]), []);
  });
});

describe("calendarWeeks", () => {
  it("pads to whole Monday-first weeks", () => {
    const weeks = calendarWeeks(ROWS, "2026-07");
    assert.ok(weeks.every((w) => w.length === 7));
    // 1 July 2026 is a Wednesday, so Monday and Tuesday are padding.
    assert.equal(weeks[0][0].date, null);
    assert.equal(weeks[0][1].date, null);
    assert.equal(weeks[0][2].date, "2026-07-01");
  });

  it("covers every day of the month exactly once", () => {
    const days = calendarWeeks(ROWS, "2026-07").flat().filter((d) => d.date);
    assert.equal(days.length, 31);
    assert.equal(new Set(days.map((d) => d.date)).size, 31);
  });

  it("handles a 30-day month and a leap February", () => {
    assert.equal(calendarWeeks([], "2026-06").flat().filter((d) => d.date).length, 30);
    assert.equal(calendarWeeks([], "2028-02").flat().filter((d) => d.date).length, 29);
    assert.equal(calendarWeeks([], "2026-02").flat().filter((d) => d.date).length, 28);
  });

  it("puts each day's totals on its own square", () => {
    const square = calendarWeeks(ROWS, "2026-07").flat().find((d) => d.date === "2026-07-22");
    assert.equal(square?.expenseZar, 150);
    assert.equal(square?.incomeZar, 5000);
    assert.equal(square?.count, 3);
  });

  it("never borrows a day from the neighbouring month", () => {
    const squares = calendarWeeks(ROWS, "2026-07").flat();
    assert.ok(squares.every((d) => d.date === null || d.date.startsWith("2026-07")));
    // June's R200 must not leak into a July padding square.
    assert.equal(squares.filter((d) => d.date === null).every((d) => d.count === 0), true);
  });
});

describe("monthsPresent", () => {
  it("lists months newest first, without duplicates", () => {
    assert.deepEqual(monthsPresent(ROWS), ["2026-07", "2026-06"]);
  });
});
