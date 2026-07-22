/**
 * The reset cutover (build report — "complete reset").
 *
 * One date decides what the whole app shows. Everything older is still in the
 * database and still queryable; it simply isn't displayed. That gives the
 * fresh-install feeling Romano asked for without destroying six months of
 * records he may be asked to produce under debt review.
 *
 * Every module that reads transactions or budgets goes through here, so a
 * screen can't accidentally show pre-reset data that the rest of the app is
 * hiding.
 */
import "server-only";

import { sql } from "./db";

export type Cutover = {
  /** ISO date, or null when no reset has been run. */
  date: string | null;
  /** True when the user has asked to see pre-reset history anyway. */
  showingHistory: boolean;
};

export async function getCutover(): Promise<Cutover> {
  const rows = await sql<{ cutover_date: string | null; show_history: boolean }>`
    select cutover_date::text, show_history from app_settings where id = true`;
  return {
    date: rows[0]?.cutover_date ?? null,
    showingHistory: rows[0]?.show_history ?? false,
  };
}

/**
 * The effective floor for any date filter: null means "no floor".
 *
 * Returning null rather than an early sentinel date matters — a sentinel would
 * silently exclude anything older than it, which is exactly the class of bug
 * this is meant to prevent.
 */
export async function cutoverFloor(): Promise<string | null> {
  const cutover = await getCutover();
  return cutover.showingHistory ? null : cutover.date;
}
