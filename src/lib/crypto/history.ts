/**
 * Portfolio history series — pure transforms, unit-testable without network.
 */

export type HistoryPoint = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Epoch ms at UTC midnight — Recharts needs a numeric axis for even spacing. */
  t: number;
  valueZar: number;
  investedZar: number;
  pnlZar: number;
  freedomProgressPct: number;
  /** True for the synthetic point representing right now. */
  live?: boolean;
};

export type RawHistoryRow = {
  date: string | null;
  createdTime: string;
  valueZar: number | null;
  investedZar: number | null;
  pnlZar: number | null;
  progressPct: number | null;
};

const ISO_DATE_IN_JOHANNESBURG = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Formats an instant as YYYY-MM-DD *in Johannesburg* (CLAUDE.md §7).
 *
 * Not `toISOString().slice(0, 10)`. Vercel runs in UTC and Romano is UTC+2, so
 * that would stamp anything logged between midnight and 02:00 SAST with the
 * previous day's date — the app is checked daily, often late, so this matters.
 */
export function toLocalISODate(date: Date): string {
  return ISO_DATE_IN_JOHANNESBURG.format(date);
}

/**
 * Airtable's `Date` column here is singleLineText. Observed values are ISO
 * ("2026-06-19"), but Snapshots uses "14 Jun 2026", so both are accepted.
 * Anything unparseable is dropped rather than plotted at epoch 0, which would
 * drag the whole axis back to 1970.
 */
export function parseHistoryDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "14 Jun 2026" is a calendar date with no timezone. Date.parse treats it as
  // local midnight, so converting through UTC would shift it a day backwards
  // for any positive offset. Read the components back in the same zone instead.
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Collapses the raw rows into one point per day.
 *
 * The retired 3-hourly scheduler wrote up to nine rows for a single date, so
 * plotting rows directly produces a sawtooth that never happened. The last
 * write of each day wins, ordered by Airtable's createdTime because the date
 * column has no time component.
 */
export function buildHistorySeries(rows: RawHistoryRow[]): HistoryPoint[] {
  const byDate = new Map<string, { row: RawHistoryRow; at: number }>();

  for (const row of rows) {
    const date = parseHistoryDate(row.date);
    if (!date) continue;
    if (row.valueZar === null || !Number.isFinite(row.valueZar)) continue;

    const at = new Date(row.createdTime).getTime();
    const existing = byDate.get(date);
    if (!existing || at >= existing.at) {
      byDate.set(date, { row, at: Number.isFinite(at) ? at : 0 });
    }
  }

  return [...byDate.entries()]
    .map(([date, { row }]) => {
      const valueZar = row.valueZar ?? 0;
      const investedZar = row.investedZar ?? 0;
      return {
        date,
        t: Date.parse(`${date}T00:00:00Z`),
        valueZar,
        investedZar,
        pnlZar: row.pnlZar ?? valueZar - investedZar,
        freedomProgressPct: row.progressPct ?? 0,
      } satisfies HistoryPoint;
    })
    .sort((a, b) => a.t - b.t);
}

/**
 * Appends a point for the current live portfolio.
 *
 * If history already has a row for today it is replaced, so pressing "save
 * snapshot" twice doesn't produce two points for the same day.
 */
export function withLivePoint(
  series: HistoryPoint[],
  live: {
    valueZar: number;
    investedZar: number;
    pnlZar: number;
    freedomProgressPct: number;
  },
  now: Date,
): HistoryPoint[] {
  const date = toLocalISODate(now);
  const point: HistoryPoint = {
    date,
    t: Date.parse(`${date}T00:00:00Z`),
    valueZar: live.valueZar,
    investedZar: live.investedZar,
    pnlZar: live.pnlZar,
    freedomProgressPct: live.freedomProgressPct,
    live: true,
  };
  return [...series.filter((p) => p.date !== date), point].sort((a, b) => a.t - b.t);
}

/** Gap in days between the last stored point and now — drives a staleness note. */
export function historyGapDays(series: HistoryPoint[], now: Date): number | null {
  const stored = series.filter((point) => !point.live);
  if (stored.length === 0) return null;
  const last = stored[stored.length - 1];
  return Math.floor((now.getTime() - last.t) / 86_400_000);
}
