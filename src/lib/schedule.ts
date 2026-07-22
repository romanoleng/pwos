/**
 * Repeat / instalment expansion (the "Rep/Inst." pattern from Romano's
 * reference app, 2026-07-22).
 *
 * A schedule turns one logged entry into a dated series:
 * - repeat     — the same amount lands every month for N months (rent, salary)
 * - instalment — one total is split across N months (a Payflex purchase)
 *
 * Everything here is pure string/number maths on ISO dates. No Date object
 * ever carries a day across a timezone — the 24th must stay the 24th (see the
 * toISOString traps in CLAUDE.md).
 */

export type ScheduleMode = "once" | "repeat" | "instalment";

export type Schedule = {
  mode: Exclude<ScheduleMode, "once">;
  /** Number of monthly entries, first one included. */
  months: number;
};

export type ScheduledEntry = {
  date: string; // yyyy-mm-dd
  amountZar: number; // positive; direction applies the sign later
  description: string;
};

export const MIN_MONTHS = 2;
export const MAX_MONTHS = 24;

function daysInMonth(year: number, month: number): number {
  // Month is 1-based. Day 0 of the next month is this month's last day —
  // Date.UTC only, so no local timezone can shift it.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Same day-of-month N months later, clamped to the target month's length.
 * Clamping is per-month, not sticky: 31 Jan → 28 Feb → 31 Mar.
 */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Not an ISO date: ${iso}`);
  const zeroBased = m - 1 + months;
  const year = y + Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Split a total into N monthly amounts that reconcile to the cent.
 * The remainder lands on the FIRST instalment — the one being paid now —
 * so every later entry is a clean, predictable figure.
 */
export function splitInstalments(totalZar: number, months: number): number[] {
  const totalCents = Math.round(Math.abs(totalZar) * 100);
  const base = Math.floor(totalCents / months);
  const first = totalCents - base * (months - 1);
  return [first / 100, ...Array.from({ length: months - 1 }, () => base / 100)];
}

export function expandSchedule(opts: {
  schedule: Schedule;
  startDate: string;
  amountZar: number;
  description: string;
}): ScheduledEntry[] {
  const { schedule, startDate, amountZar, description } = opts;
  const months = Math.trunc(schedule.months);
  if (months < MIN_MONTHS || months > MAX_MONTHS) {
    throw new Error(`Months must be ${MIN_MONTHS}–${MAX_MONTHS}, got ${schedule.months}`);
  }

  if (schedule.mode === "repeat") {
    return Array.from({ length: months }, (_, i) => ({
      date: addMonthsClamped(startDate, i),
      amountZar: Math.abs(amountZar),
      description,
    }));
  }

  const amounts = splitInstalments(amountZar, months);
  return amounts.map((amount, i) => ({
    date: addMonthsClamped(startDate, i),
    amountZar: amount,
    // The suffix is the ledger's own record of where a charge sits in its
    // series — greppable long after the sheet that created it is gone.
    description: `${description} (${i + 1}/${months})`,
  }));
}
