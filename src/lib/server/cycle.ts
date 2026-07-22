/**
 * The current pay cycle, anchored to when income actually arrived.
 *
 * Every server module that needs a cycle goes through here rather than calling
 * getBudgetCycle directly, so none of them can disagree about when the month
 * began.
 */
import "server-only";

import { getBudgetCycle, type BudgetCycle } from "@/lib/budget";

import { cutoverFloor } from "./cutover";
import { sql } from "./db";

export async function getCycleAnchors(): Promise<string[]> {
  const rows = await sql<{ started_on: string }>`
    select started_on::text from cycle_anchors order by started_on`;
  return rows.map((r) => r.started_on);
}

export async function getCurrentCycle(now: Date = new Date()): Promise<BudgetCycle> {
  const cycle = getBudgetCycle(now, await getCycleAnchors());

  // After a fresh start, the new life begins at the cutover even if the
  // nominal cycle started earlier. Without this, the two days between
  // pressing reset and payday would show June's (hidden) cycle — and
  // anything set up for the new one would land invisible.
  const floor = await cutoverFloor();
  if (floor !== null && cycle.start < floor) {
    const forward = getBudgetCycle(new Date(`${floor}T12:00:00+02:00`), await getCycleAnchors());
    return forward.start === floor ? forward : { ...forward, start: floor };
  }
  return cycle;
}

/** The cycle before the current one, for period comparisons. */
export async function getCycleBounds(now: Date = new Date()): Promise<{
  start: string; end: string; previousStart: string | null;
}> {
  const anchors = await getCycleAnchors();
  const cycle = getBudgetCycle(now, anchors);
  const floor = await cutoverFloor();
  const earlier = anchors.filter(
    (a) => a < cycle.start && (floor === null || a >= floor),
  );
  return {
    start: cycle.start,
    end: cycle.end,
    previousStart: earlier.length > 0 ? earlier[earlier.length - 1] : null,
  };
}
