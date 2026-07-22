/**
 * Date ranges (CLAUDE.md §5, §9b).
 *
 * One definition of "what period am I looking at", shared by every screen, so
 * Home, Transactions and Reports can never disagree about what "this month"
 * means.
 *
 * Every range is [start, end) — start inclusive, end exclusive. Half-open
 * ranges compose without off-by-one errors: yesterday's end is today's start,
 * and no transaction is ever counted twice or missed at a boundary.
 *
 * All dates are calendar dates in Africa/Johannesburg, passed as ISO strings.
 * Nothing here constructs a Date from an instant — see budget.ts for why.
 */

export type PeriodKind =
  | "cycle"
  | "lastCycle"
  | "mtd"
  | "week"
  | "last7"
  | "last30"
  | "all";

export type Period = {
  kind: PeriodKind;
  /** Inclusive ISO date. Null only for "all". */
  start: string | null;
  /** Exclusive ISO date. */
  end: string;
  label: string;
  /** Short label for a tab. */
  shortLabel: string;
};

export const PERIOD_OPTIONS: { kind: PeriodKind; shortLabel: string; label: string }[] = [
  { kind: "cycle", shortLabel: "Cycle", label: "This pay cycle" },
  { kind: "mtd", shortLabel: "MTD", label: "Month to date" },
  { kind: "week", shortLabel: "Week", label: "This week" },
  { kind: "last30", shortLabel: "30d", label: "Last 30 days" },
  { kind: "lastCycle", shortLabel: "Last", label: "Previous pay cycle" },
  { kind: "all", shortLabel: "All", label: "Everything" },
];

export function isPeriodKind(value: string | null | undefined): value is PeriodKind {
  return (
    value === "cycle" || value === "lastCycle" || value === "mtd" ||
    value === "week" || value === "last7" || value === "last30" || value === "all"
  );
}

function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Monday-based: a week that starts on Sunday cuts the weekend in half. */
function startOfWeek(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const backToMonday = day === 0 ? 6 : day - 1;
  return addDays(iso, -backToMonday);
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export type CycleBounds = { start: string; end: string; previousStart: string | null };

/**
 * Resolve a period to concrete dates.
 *
 * `today` and the cycle bounds are passed in rather than read from the clock,
 * so this stays pure and testable — and so the caller decides which timezone
 * "today" means.
 */
export function resolvePeriod(
  kind: PeriodKind,
  today: string,
  cycle: CycleBounds,
): Period {
  // End is exclusive, so "up to and including today" is tomorrow.
  const tomorrow = addDays(today, 1);

  switch (kind) {
    case "cycle":
      return {
        kind, start: cycle.start,
        // A cycle in progress ends today, not on its nominal end date —
        // showing an empty future would make the totals look wrong.
        end: cycle.end < tomorrow ? cycle.end : tomorrow,
        label: "This pay cycle", shortLabel: "Cycle",
      };

    case "lastCycle":
      return {
        kind,
        start: cycle.previousStart ?? cycle.start,
        end: cycle.start,
        label: "Previous pay cycle", shortLabel: "Last",
      };

    case "mtd":
      return {
        kind, start: startOfMonth(today), end: tomorrow,
        label: "Month to date", shortLabel: "MTD",
      };

    case "week":
      return {
        kind, start: startOfWeek(today), end: tomorrow,
        label: "This week", shortLabel: "Week",
      };

    case "last7":
      return {
        kind, start: addDays(today, -6), end: tomorrow,
        label: "Last 7 days", shortLabel: "7d",
      };

    case "last30":
      return {
        kind, start: addDays(today, -29), end: tomorrow,
        label: "Last 30 days", shortLabel: "30d",
      };

    case "all":
      return { kind, start: null, end: tomorrow, label: "Everything", shortLabel: "All" };
  }
}

/** Whole days in a period; null when it's unbounded. */
export function periodDays(period: Period): number | null {
  if (period.start === null) return null;
  return Math.round(
    (Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) /
      86_400_000,
  );
}
