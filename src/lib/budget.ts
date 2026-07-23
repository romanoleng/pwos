/**
 * Budget cycle maths (CLAUDE.md §5, §7).
 *
 * Salary lands on the 24th, so a budget cycle runs 24th → 24th, not
 * 1st → month end. Everything here is pure and timezone-explicit: the cycle
 * boundary is a *calendar* date in Africa/Johannesburg, and Vercel runs in UTC,
 * so deriving it from a UTC instant would roll the cycle over two hours early.
 */
import { toLocalISODate } from "./crypto/history.ts";
import { PAYDAY_DAY_OF_MONTH } from "./constants.ts";

export type BudgetCycle = {
  /** Inclusive ISO date the cycle starts (a 24th). */
  start: string;
  /** Exclusive ISO date the cycle ends (the next 24th). */
  end: string;
  /** Days from start to end. */
  totalDays: number;
  /** Days already elapsed, at least 0. */
  elapsedDays: number;
  /** Days left including today, at least 0. */
  remainingDays: number;
  /** The Budget table's Month value this cycle maps to (yyyy-mm-01). */
  budgetMonth: string;
};

function isoDate(year: number, monthIndex: number, day: number): string {
  // Construct in UTC deliberately: these are calendar dates, not instants, so
  // they must not be shifted by any local offset.
  const date = new Date(Date.UTC(year, monthIndex, day));
  return date.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number {
  return Math.round(
    (Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * The cycle containing `now`, given the days income actually landed.
 *
 * Anchors win when there are any: Romano is paid by clients, not a payroll, so
 * the money arrives near the 24th but rarely on it. The 24th remains the
 * fallback for dates older than the first anchor.
 *
 * On the anchor day itself the *new* cycle starts — payday money belongs to the
 * month it funds, not the one just closed.
 */
export function getBudgetCycle(
  now: Date = new Date(),
  /** Cycle start dates, any order. */
  anchors: string[] = [],
): BudgetCycle {
  const today = toLocalISODate(now);

  if (anchors.length > 0) {
    const sorted = [...new Set(anchors)].sort();
    const startedIndex = sorted.findLastIndex((anchor) => anchor <= today);
    if (startedIndex !== -1) {
      const start = sorted[startedIndex];
      const next = sorted[startedIndex + 1];
      // The cycle runs to the next anchor, or to where the nominal payday
      // would fall if the next payment hasn't been logged yet.
      const end = next ?? nominalCycle(start).end;
      return buildCycle(start, end, today);
    }
  }

  return nominalCycle(today);
}

function buildCycle(start: string, end: string, today: string): BudgetCycle {
  const totalDays = daysBetween(start, end);
  const elapsedDays = Math.max(0, daysBetween(start, today));
  return {
    start,
    end,
    totalDays,
    elapsedDays: Math.min(elapsedDays, totalDays),
    remainingDays: Math.max(0, totalDays - elapsedDays),
    // Named for the month it ends in, matching nominalCycle below.
    budgetMonth: `${end.slice(0, 7)}-01`,
  };
}

/** The fixed 24th-to-24th cycle, used before any anchor exists. */
function nominalCycle(now: Date | string = new Date()): BudgetCycle {
  const today = typeof now === "string" ? now : toLocalISODate(now);
  const [year, month, day] = today.split("-").map(Number);
  const monthIndex = month - 1;

  const startsThisMonth = day >= PAYDAY_DAY_OF_MONTH;
  const start = startsThisMonth
    ? isoDate(year, monthIndex, PAYDAY_DAY_OF_MONTH)
    : isoDate(year, monthIndex - 1, PAYDAY_DAY_OF_MONTH);
  const end = startsThisMonth
    ? isoDate(year, monthIndex + 1, PAYDAY_DAY_OF_MONTH)
    : isoDate(year, monthIndex, PAYDAY_DAY_OF_MONTH);

  const totalDays = daysBetween(start, end);
  const elapsedDays = Math.max(0, daysBetween(start, today));

  return {
    start,
    end,
    totalDays,
    elapsedDays,
    remainingDays: Math.max(0, totalDays - elapsedDays),
    // A cycle is named for the month it ends in: 24 Jun → 24 Jul is the July
    // budget, which matches how the Budget table is already filled in.
    budgetMonth: `${end.slice(0, 7)}-01`,
  };
}

/** True when an ISO date falls inside the cycle (start inclusive, end exclusive). */
export function isInCycle(dateIso: string | null | undefined, cycle: BudgetCycle): boolean {
  if (!dateIso) return false;
  const date = dateIso.slice(0, 10);
  return date >= cycle.start && date < cycle.end;
}

export type BudgetLine = {
  recordId: string;
  category: string;
  type: string | null;
  budgetedZar: number;
  actualZar: number;
  remainingZar: number;
  /** 0-100+, uncapped so overspend is visible. */
  usedPct: number;
  transactionCount: number;
};

export type BudgetSummary = {
  cycle: BudgetCycle;
  lines: BudgetLine[];
  /** "Putting away" lines — planned monthly contributions (crypto, savings). */
  contributions: BudgetLine[];
  /** Contribution categories with no put-away line yet, for the add picker. */
  availableContributions: { name: string; kind: string }[];
  totals: {
    budgetedZar: number;
    actualZar: number;
    remainingZar: number;
    /** Real expenses only — transfers and contributions never count (§3). */
    incomeZar: number;
  };
  /** Spend with no matching budget line, so it can't hide. */
  unbudgetedZar: number;
  unbudgetedCategories: { category: string; amountZar: number }[];
  /** Remaining budget ÷ days left. Null once the cycle is over. */
  dailyAllowanceZar: number | null;
  /** Categories that could still be given a line this cycle. */
  availableCategories: { name: string; kind: string }[];
  /**
   * The income side of the plan. `unallocatedZar` is what hasn't been given a
   * job yet — negative means more is planned than is expected to arrive.
   */
  plan: {
    expectedIncomeZar: number;
    receivedIncomeZar: number;
    allocatedZar: number;
    puttingAwayZar: number;
    unallocatedZar: number;
  };
  /** Titles a blank restore would recreate at R0. Survives the reset. */
  blankStart: { titles: number; from: string } | null;
  /** Set only when the cycle has no lines yet: what each starting option gives. */
  cycleStart: {
    from: string;
    copyLines: number; copyTotalZar: number;
    seedLines: number; seedTotalZar: number;
  } | null;
};

/**
 * Pace: how far through the cycle you are, versus how much you've spent.
 * Above 1 means spending faster than the days are passing.
 */
export function spendPace(summary: BudgetSummary): number | null {
  const { totalDays, elapsedDays } = summary.cycle;
  if (totalDays === 0 || summary.totals.budgetedZar === 0) return null;
  const timeThrough = elapsedDays / totalDays;
  if (timeThrough === 0) return null;
  const moneyThrough = summary.totals.actualZar / summary.totals.budgetedZar;
  return moneyThrough / timeThrough;
}
