/**
 * Debt analysis (CLAUDE.md §3, §5).
 *
 * §3 flags that the debt review appears twice — Anders (~R160,345) and MBD
 * Legal (~R160,745). The live base is worse: Net Worth also carries a combined
 * "Anders / SCM / MBD Legal" row at R100,000, so the same obligation is
 * represented three ways and the two tables disagree by ~R240k.
 *
 * Debt Tracker is the single source (§3). Duplicates are DETECTED and FLAGGED
 * for confirmation, never silently merged — deleting a real debt because two
 * rows looked alike would be far worse than showing both.
 */

export type DebtRow = {
  recordId: string;
  name: string;
  type: string | null;
  balanceZar: number;
  monthlyZar: number;
  interestPct: number | null;
  priority: string | null;
  status: string | null;
  payoffDate: string | null;
  /** The balance is a best guess, not a figure off a statement. */
  balanceEstimated: boolean;
};

export type DuplicateGroup = {
  reason: string;
  rows: DebtRow[];
  /** What the total becomes if they are the same debt. */
  dedupedZar: number;
  /** What is currently being counted. */
  countedZar: number;
};

/** Strips punctuation and case so "Pay Just Now" matches "PayJustNow". */
function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Finds debts that are probably the same obligation entered more than once.
 *
 * Two signals, both conservative:
 *  - names that all refer to the debt review
 *  - names that normalise to the same string
 */
export function findDuplicates(rows: DebtRow[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  // Only exact name collisions are flagged. An earlier version inferred that
  // Anders, MBD Legal and SCM were one debt review re-entered three times.
  // Romano confirmed they are three separate creditors, so that heuristic was
  // crying wolf on correct data — worse than staying quiet. Genuine duplicates
  // are now recorded explicitly via debts.duplicate_of in Postgres.
  const byName = new Map<string, DebtRow[]>();
  for (const row of rows) {
    const key = normalise(row.name);
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  for (const [, matches] of byName) {
    if (matches.length > 1) {
      groups.push({
        reason: "These rows have the same name.",
        rows: matches,
        dedupedZar: Math.max(...matches.map((row) => row.balanceZar)),
        countedZar: matches.reduce((total, row) => total + row.balanceZar, 0),
      });
    }
  }

  return groups;
}

export type DebtSummary = {
  rows: DebtRow[];
  totalZar: number;
  /** Total if every flagged duplicate is one debt. */
  dedupedTotalZar: number;
  monthlyZar: number;
  duplicates: DuplicateGroup[];
  /** Debt Tracker total vs the Net Worth liability rollup. */
  /** Share of totalZar that is an estimate rather than a statement figure. */
  estimatedZar: number;
  netWorthLiabilitiesZar: number;
  discrepancyZar: number;
};

/** Avalanche order: highest interest first, then smallest balance. */
export function payoffOrder(rows: DebtRow[]): DebtRow[] {
  return [...rows].sort((a, b) => {
    const interest = (b.interestPct ?? 0) - (a.interestPct ?? 0);
    if (interest !== 0) return interest;
    return a.balanceZar - b.balanceZar;
  });
}
