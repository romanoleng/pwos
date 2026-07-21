/**
 * Milestone engine — M1–M5 (CLAUDE.md §5).
 *
 * The Airtable milestone columns are `multilineText` written by hand over
 * months, so this parses a *convention*, not a schema. Observed shapes:
 *
 *   Price: R181.20 | Sell R1,268 (7 coins) | Keep 75
 *   Price: R0.70 | Sell R1,500 (~2,143 coins) | Keep ~2.998M [Corrected 22 Jun 2026 …]
 *   Price: R1.5M | Sell tiny fraction, too small to scale meaningfully | Keep most
 *   Price: R8 | Sell R200 (38 coins) | Keep 62 [M1 pushed +30%, 22 Jun 2026 …]
 *   n/a
 *   n/a — Stablecoin, no milestone needed
 *   Feb 2028 OR parabolic — Sell ALL 20 moonbag | No exceptions.
 *   LOW CONVICTION — NO FRESH CAPITAL. Exit at M4, no moonbag, no exceptions.
 *
 * Two rules govern this file, because a misread sell instruction is worse than
 * no instruction at all:
 *
 *  1. `raw` is always preserved and always what the UI shows as the
 *     instruction. Parsed fields drive comparisons and sorting only.
 *  2. Anything not confidently parsed becomes null, never a guess. A null
 *     trigger renders as "see instruction", not as R0.
 *
 * NUMBER FORMAT: this text uses US conventions — "R1,268.50" is one thousand
 * two hundred sixty-eight. It is NOT en-ZA (where "," is the decimal mark).
 * Display formatting is en-ZA; parsing here must not be.
 */

export type MilestoneLevel = 1 | 2 | 3 | 4 | 5;

export type Milestone = {
  level: MilestoneLevel;
  /** Verbatim Airtable text. Always shown to the user. */
  raw: string;
  /** True when the cell is empty or an explicit "n/a". */
  none: boolean;
  /** Trigger price in ZAR, or null when there is no numeric trigger. */
  triggerZar: number | null;
  /** Rand value to sell at this trigger, when stated numerically. */
  sellZar: number | null;
  /** Coin count to sell, when stated. `approx` mirrors a leading "~". */
  sellCoins: number | null;
  sellCoinsApprox: boolean;
  /** Coins to keep afterwards, when stated numerically ("most" → null). */
  keepCoins: number | null;
  keepCoinsApprox: boolean;
  /** Bracketed annotation, e.g. "M1 pushed +30%, 22 Jun 2026". */
  note: string | null;
  /** M5 and some M1s are date/conviction-based rather than price-based. */
  isDateBased: boolean;
};

export type MilestoneStatus = {
  milestone: Milestone;
  /** Live price has reached or passed the trigger. */
  hit: boolean;
  /** Percent the price must still rise to reach the trigger. Null if untriggerable. */
  distancePct: number | null;
};

export type MilestoneAssessment = {
  all: MilestoneStatus[];
  /** Lowest un-hit milestone with a numeric trigger — what to watch next. */
  next: MilestoneStatus | null;
  /** Highest hit milestone — drives the MILESTONE HIT banner. */
  lastHit: MilestoneStatus | null;
  hitCount: number;
};

const NOT_APPLICABLE = /^n\s*\/\s*a\b/i;

/**
 * "1,234.56" → 1234.56 · "1.5M" → 1500000 · "2.998M" → 2998000 · "70,000" → 70000
 * Returns null rather than NaN so callers can't accidentally arithmetic on it.
 */
export function parseAmount(input: string | null | undefined): number | null {
  if (!input) return null;
  const match = input.match(/(-?[\d,]+(?:\.\d+)?)\s*([MmKk])?/);
  if (!match) return null;

  const digits = match[1].replace(/,/g, "");
  const value = Number.parseFloat(digits);
  if (!Number.isFinite(value)) return null;

  const suffix = match[2]?.toLowerCase();
  if (suffix === "m") return value * 1_000_000;
  if (suffix === "k") return value * 1_000;
  return value;
}

/** Parses one milestone cell. Never throws. */
export function parseMilestone(
  level: MilestoneLevel,
  rawInput: string | null | undefined,
): Milestone {
  const raw = (rawInput ?? "").trim();

  const base: Milestone = {
    level,
    raw,
    none: false,
    triggerZar: null,
    sellZar: null,
    sellCoins: null,
    sellCoinsApprox: false,
    keepCoins: null,
    keepCoinsApprox: false,
    note: null,
    isDateBased: false,
  };

  if (raw.length === 0 || NOT_APPLICABLE.test(raw)) {
    return { ...base, none: true };
  }

  // Bracketed annotations are commentary; strip before parsing the instruction.
  const noteMatch = raw.match(/\[([^\]]+)\]/);
  const note = noteMatch ? noteMatch[1].trim() : null;
  const body = noteMatch ? raw.replace(noteMatch[0], " ") : raw;

  const triggerMatch = body.match(/Price:\s*R\s*([\d,]+(?:\.\d+)?\s*[MmKk]?)/i);
  const triggerZar = triggerMatch ? parseAmount(triggerMatch[1]) : null;

  // "Sell R1,268" — but not "Sell ALL", "Sell tiny fraction", etc.
  const sellMatch = body.match(/Sell\s+R\s*([\d,]+(?:\.\d+)?\s*[MmKk]?)/i);
  const sellZar = sellMatch ? parseAmount(sellMatch[1]) : null;

  // "(7 coins)" / "(~2,143 coins)" / "(1 coin)"
  const coinsMatch = body.match(/\(\s*(~?)\s*([\d,]+(?:\.\d+)?\s*[MmKk]?)\s*coins?\s*\)/i);
  const sellCoins = coinsMatch ? parseAmount(coinsMatch[2]) : null;

  // "Keep 1,058" / "Keep ~2.998M" / "Keep most" (→ null)
  const keepMatch = body.match(/Keep\s+(~?)\s*([\d,]+(?:\.\d+)?\s*[MmKk]?)\b/i);
  const keepCoins = keepMatch ? parseAmount(keepMatch[2]) : null;

  // M5 is the hard Feb-2028 exit; some cells are conviction notes with no trigger.
  const isDateBased =
    triggerZar === null &&
    /\b(feb\s*2028|parabolic|no fresh capital|dry powder|exit at m\d)\b/i.test(body);

  return {
    ...base,
    triggerZar,
    sellZar,
    sellCoins,
    sellCoinsApprox: Boolean(coinsMatch?.[1]),
    keepCoins,
    keepCoinsApprox: Boolean(keepMatch?.[1]),
    note,
    isDateBased,
  };
}

export type MilestoneSource = {
  m1?: string | null;
  m2?: string | null;
  m3?: string | null;
  m4?: string | null;
  m5?: string | null;
};

export function parseMilestones(source: MilestoneSource): Milestone[] {
  return [
    parseMilestone(1, source.m1),
    parseMilestone(2, source.m2),
    parseMilestone(3, source.m3),
    parseMilestone(4, source.m4),
    parseMilestone(5, source.m5),
  ];
}

/**
 * Compares live price against each trigger.
 *
 * A milestone with no numeric trigger is never "hit" — M5's Feb-2028 exit is a
 * calendar decision, and inferring it from price would fabricate an instruction
 * the user never wrote.
 */
export function assessMilestones(
  milestones: Milestone[],
  livePriceZar: number | null,
): MilestoneAssessment {
  const all: MilestoneStatus[] = milestones.map((milestone) => {
    if (
      milestone.none ||
      milestone.triggerZar === null ||
      milestone.triggerZar <= 0 ||
      livePriceZar === null ||
      !Number.isFinite(livePriceZar)
    ) {
      return { milestone, hit: false, distancePct: null };
    }

    const hit = livePriceZar >= milestone.triggerZar;
    const distancePct = hit
      ? 0
      : ((milestone.triggerZar - livePriceZar) / livePriceZar) * 100;

    return { milestone, hit, distancePct };
  });

  const triggerable = all.filter((status) => status.milestone.triggerZar !== null);

  const next =
    triggerable
      .filter((status) => !status.hit)
      .sort(
        (a, b) => (a.milestone.triggerZar ?? 0) - (b.milestone.triggerZar ?? 0),
      )[0] ?? null;

  const hits = triggerable.filter((status) => status.hit);
  const lastHit =
    hits.sort((a, b) => (b.milestone.triggerZar ?? 0) - (a.milestone.triggerZar ?? 0))[0] ??
    null;

  return { all, next, lastHit, hitCount: hits.length };
}
