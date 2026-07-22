/**
 * Four ways of reading the same transactions (CLAUDE.md §9b).
 *
 * A flat reverse-chronological list answers "what did I just log". It does not
 * answer "which days do I overspend on", "is this month worse than last", or
 * "where is it all going" — so the same rows are also grouped by day, by
 * month, by calendar square, and by category.
 *
 * All pure, all sorted deterministically. Dates are ISO calendar strings and
 * are never turned into instants: a Date built from "2026-07-24" is midnight
 * UTC, which in Africa/Johannesburg is already the 24th at 02:00, and any
 * arithmetic from there drifts a day at month boundaries.
 */

export type ViewRow = {
  recordId: string;
  date: string | null;
  amountZar: number;
  category: string | null;
  type: string;
};

export type DayGroup<T> = {
  date: string;
  incomeZar: number;
  expenseZar: number;
  netZar: number;
  rows: T[];
};

/** Spending is stored negative; these views want a positive magnitude. */
function expenseOf(row: ViewRow): number {
  return row.type === "expense" ? -row.amountZar : 0;
}

function incomeOf(row: ViewRow): number {
  return row.type === "income" ? row.amountZar : 0;
}

/**
 * Newest day first, matching the list it replaces. Rows with no date are
 * dropped from day grouping rather than bucketed under a fake one — an
 * invented date is worse than a missing row.
 */
export function groupByDay<T extends ViewRow>(rows: T[]): DayGroup<T>[] {
  const byDate = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.date) continue;
    const day = row.date.slice(0, 10);
    const list = byDate.get(day) ?? [];
    list.push(row);
    byDate.set(day, list);
  }

  return [...byDate.entries()]
    .map(([date, list]) => ({
      date,
      incomeZar: list.reduce((t, r) => t + incomeOf(r), 0),
      expenseZar: list.reduce((t, r) => t + expenseOf(r), 0),
      netZar: list.reduce((t, r) => t + incomeOf(r) - expenseOf(r), 0),
      rows: list,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export type MonthGroup = {
  /** yyyy-mm */
  month: string;
  incomeZar: number;
  expenseZar: number;
  netZar: number;
  count: number;
};

export function groupByMonth(rows: ViewRow[]): MonthGroup[] {
  const byMonth = new Map<string, ViewRow[]>();
  for (const row of rows) {
    if (!row.date) continue;
    const month = row.date.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push(row);
    byMonth.set(month, list);
  }

  return [...byMonth.entries()]
    .map(([month, list]) => ({
      month,
      incomeZar: list.reduce((t, r) => t + incomeOf(r), 0),
      expenseZar: list.reduce((t, r) => t + expenseOf(r), 0),
      netZar: list.reduce((t, r) => t + incomeOf(r) - expenseOf(r), 0),
      count: list.length,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export type CategoryShare = {
  category: string;
  spentZar: number;
  /** 0-100 of total spend. */
  sharePct: number;
  count: number;
};

/** Spending only: mixing income in would make the shares meaningless. */
export function summariseCategories(rows: ViewRow[]): CategoryShare[] {
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    if (row.type !== "expense") continue;
    const key = row.category ?? "Uncategorised";
    const entry = byCategory.get(key) ?? { total: 0, count: 0 };
    entry.total += -row.amountZar;
    entry.count += 1;
    byCategory.set(key, entry);
  }

  const total = [...byCategory.values()].reduce((t, e) => t + e.total, 0);

  return [...byCategory.entries()]
    .map(([category, entry]) => ({
      category,
      spentZar: entry.total,
      sharePct: total > 0 ? (entry.total / total) * 100 : 0,
      count: entry.count,
    }))
    .sort((a, b) => b.spentZar - a.spentZar);
}

export type CalendarDay = {
  /** Null for the padding squares before the 1st and after the last day. */
  date: string | null;
  dayOfMonth: number | null;
  incomeZar: number;
  expenseZar: number;
  count: number;
};

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A month as Monday-first weeks, padded so every row has seven squares.
 *
 * `month` is "yyyy-mm". Days outside the month are null rather than borrowed
 * from the neighbouring one: a square showing spending that belongs to another
 * month is worse than an empty square.
 */
export function calendarWeeks(rows: ViewRow[], month: string): CalendarDay[][] {
  const [year, monthNumber] = month.split("-").map(Number);
  const totals = new Map<string, { income: number; expense: number; count: number }>();

  for (const row of rows) {
    if (!row.date || row.date.slice(0, 7) !== month) continue;
    const day = row.date.slice(0, 10);
    const entry = totals.get(day) ?? { income: 0, expense: 0, count: 0 };
    entry.income += incomeOf(row);
    entry.expense += expenseOf(row);
    entry.count += 1;
    totals.set(day, entry);
  }

  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const leading = firstWeekday === 0 ? 6 : firstWeekday - 1; // Monday-first
  const total = daysInMonth(year, monthNumber);

  const squares: CalendarDay[] = [];
  for (let i = 0; i < leading; i += 1) {
    squares.push({ date: null, dayOfMonth: null, incomeZar: 0, expenseZar: 0, count: 0 });
  }
  for (let day = 1; day <= total; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const entry = totals.get(date);
    squares.push({
      date,
      dayOfMonth: day,
      incomeZar: entry?.income ?? 0,
      expenseZar: entry?.expense ?? 0,
      count: entry?.count ?? 0,
    });
  }
  while (squares.length % 7 !== 0) {
    squares.push({ date: null, dayOfMonth: null, incomeZar: 0, expenseZar: 0, count: 0 });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < squares.length; i += 7) weeks.push(squares.slice(i, i + 7));
  return weeks;
}

/** Months present in the rows, newest first. Used to drive the calendar picker. */
export function monthsPresent(rows: ViewRow[]): string[] {
  const months = new Set<string>();
  for (const row of rows) if (row.date) months.add(row.date.slice(0, 7));
  return [...months].sort((a, b) => b.localeCompare(a));
}
