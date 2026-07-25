/**
 * The daily brief — a card at the top of Home that greets Romano once a day
 * with what matters (Romano's ask, 2026-07-25).
 *
 * Cost discipline (the whole reason it's built this way):
 *  - The FIGURES are computed by the app, never by the model — so they're
 *    always exact and can't be hallucinated. The model only writes the
 *    sentence around them.
 *  - That sentence is generated ONCE per day, on the first open, and cached in
 *    `daily_brief`. Every later open that day re-serves the stored snapshot —
 *    no new API call. One Haiku call a day keeps months of use inside a few
 *    dollars of credit.
 *  - If the model is unreachable (no key, no credit), a deterministic sentence
 *    stands in and is NOT cached, so it retries — and starts using the model
 *    again — the moment the key is fixed.
 *
 * The voice (Coach / Analyst / Gentle) and which sections appear are Romano's
 * to set in Settings; changing them clears today's cached brief so the change
 * shows next time Home opens (app/actions/brief.ts).
 */
import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { FREEDOM_TARGET_ZAR } from "@/lib/constants";
import { toLocalISODate } from "@/lib/crypto/history";

import { getPortfolio } from "./crypto";
import { getDebtSummary } from "./debt";
import { sql } from "./db";
import { env } from "./env";
import { getGoals } from "./goals";
import { getHome } from "./home";

const BRIEF_MODEL = "claude-haiku-4-5";

export type BriefTone = "coach" | "analyst" | "gentle";
export const BRIEF_TONES: BriefTone[] = ["coach", "analyst", "gentle"];

export type BriefInclude = {
  budget: boolean;
  crypto: boolean;
  debt: boolean;
  goals: boolean;
  kids: boolean;
};

export type BriefPrefs = {
  enabled: boolean;
  tone: BriefTone;
  include: BriefInclude;
};

/**
 * One chip on the card. Money carries the raw number so the client can mask it
 * under the privacy eye; percent/text carry a pre-formatted display string
 * (percentages stay visible in privacy mode — the shape without the substance).
 */
export type BriefFact =
  | { key: string; label: string; kind: "money"; amount: number | null; tone?: "gain" | "loss" | "flat" }
  | { key: string; label: string; kind: "percent"; value: string; tone?: "gain" | "loss" | "flat" }
  | { key: string; label: string; kind: "text"; value: string };

export type DailyBrief = {
  date: string;
  /** "Saturday · 25 Jul" */
  greeting: string;
  tone: BriefTone;
  body: string;
  source: "ai" | "fallback";
  facts: BriefFact[];
};

function rand(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "an unknown amount";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function signedPct(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1).replace(".", ",")}%`;
}

function greetingFor(dateIso: string): string {
  // Noon SAST avoids the midnight-rollover trap when deriving the weekday.
  const d = new Date(`${dateIso}T12:00:00+02:00`);
  const weekday = new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    timeZone: "Africa/Johannesburg",
  }).format(d);
  const dayMonth = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
  }).format(d);
  return `${weekday} · ${dayMonth}`;
}

type Assembled = {
  facts: BriefFact[];
  /** Compact fact list handed to the model — plain figures, nothing backend. */
  modelFacts: string[];
  /** Deterministic sentence for when the model can't be reached. */
  fallback: string;
};

async function assemble(include: BriefInclude): Promise<Assembled> {
  // Fetch only what the included sections need — no wasted work (or CoinGecko
  // round-trip) for a section the brief won't mention.
  const [home, portfolio, debt, goals] = await Promise.all([
    include.budget ? getHome("cycle") : Promise.resolve(null),
    include.crypto
      ? getPortfolio().catch((error) => {
          console.error("[brief] portfolio unavailable", error);
          return null;
        })
      : Promise.resolve(null),
    include.debt ? getDebtSummary() : Promise.resolve(null),
    include.goals || include.kids ? getGoals() : Promise.resolve(null),
  ]);

  const facts: BriefFact[] = [];
  const modelFacts: string[] = [];
  const bits: string[] = [];

  if (home) {
    const spend = home.available.spendableZar;
    facts.push({ key: "spend", label: "To spend", kind: "money", amount: spend });
    modelFacts.push(`Spendable cash right now: ${rand(spend)}.`);

    if (home.budget.overspent) {
      facts.push({
        key: "perday",
        label: "Over budget",
        kind: "money",
        amount: Math.abs(home.budget.remainingZar),
        tone: "loss",
      });
      modelFacts.push(
        `Over the budget for this cycle by ${rand(Math.abs(home.budget.remainingZar))} with ${home.budget.daysLeft} days still to go.`,
      );
      bits.push(
        `you're ${rand(Math.abs(home.budget.remainingZar))} over budget with ${home.budget.daysLeft} days left`,
      );
    } else {
      const perDay = home.budget.dailyAllowanceZar;
      facts.push({ key: "perday", label: "Per day", kind: "money", amount: perDay });
      if (perDay !== null) {
        modelFacts.push(
          `Budget left works out to ${rand(perDay)} a day for the ${home.budget.daysLeft} days left in the cycle.`,
        );
        bits.push(
          `you've got ${rand(spend)} to spend — about ${rand(perDay)} a day for the next ${home.budget.daysLeft} days`,
        );
      } else {
        bits.push(`you've got ${rand(spend)} to spend this cycle`);
      }
    }

    facts.push({
      key: "payday",
      label: "To payday",
      kind: "text",
      value: `${home.budget.daysLeft}d`,
    });
  }

  if (portfolio && portfolio.totals.change24hPct !== null) {
    const c = portfolio.totals.change24hPct;
    facts.push({
      key: "crypto",
      label: "Crypto 24h",
      kind: "percent",
      value: signedPct(c),
      tone: c > 0 ? "gain" : c < 0 ? "loss" : "flat",
    });
    modelFacts.push(`Crypto portfolio is ${signedPct(c)} over the last 24 hours.`);

    const topMover = portfolio.movers?.[0];
    if (topMover) {
      modelFacts.push(`Biggest 24h mover is ${topMover.symbol} at ${signedPct(topMover.change24hPct)}.`);
    }
    if (portfolio.milestoneHits.length > 0) {
      const syms = [...new Set(portfolio.milestoneHits.map((h) => h.symbol))].join(", ");
      modelFacts.push(
        `MILESTONE HIT — ${syms} has crossed a sell/keep trigger and needs a look on the Crypto screen.`,
      );
      bits.push(`crypto's ${signedPct(c)} today and ${syms} hit a milestone — worth a look`);
    } else {
      const dir = c > 0 ? "up" : c < 0 ? "down" : "flat";
      bits.push(`crypto's ${dir} ${signedPct(c)} today`);
    }
  }

  if (debt) {
    facts.push({ key: "debt", label: "Owed", kind: "money", amount: debt.totalZar, tone: "loss" });
    const est = debt.estimatedZar > 0 ? ` (${rand(debt.estimatedZar)} of it estimated)` : "";
    modelFacts.push(
      `Total debt owed: ${rand(debt.totalZar)}${est}, costing ${rand(debt.monthlyZar)} a month.`,
    );
  }

  if (goals && include.goals) {
    const f = goals.freedom;
    facts.push({
      key: "freedom",
      label: "Freedom",
      kind: "percent",
      value: `${f.progressPct.toFixed(1).replace(".", ",")}%`,
      tone: f.progressPct >= 0 ? "flat" : "loss",
    });
    modelFacts.push(
      `Freedom goal (net worth toward ${rand(FREEDOM_TARGET_ZAR)}): ${rand(f.currentZar)}, ${f.progressPct.toFixed(1)}% of the way. This can be negative while debt outweighs assets — don't dress it up.`,
    );
  }

  if (goals && include.kids && goals.kids.length > 0) {
    facts.push({ key: "kids", label: "Kids", kind: "money", amount: goals.totals.kidsZar });
    modelFacts.push(
      `Lisa & Liam hold ${rand(goals.totals.kidsZar)} between them (kept out of Romano's own net worth).`,
    );
  }

  const fallback =
    bits.length > 0
      ? `Morning, Romano. ${bits.join("; ").replace(/^./, (m) => m.toUpperCase())}.`
      : "Morning, Romano. Nothing pressing to flag today.";

  return { facts, modelFacts, fallback };
}

const TONE_SYSTEM: Record<BriefTone, string> = {
  coach: `You write the one-line morning brief inside Romano's private South African finance app, PWOS. Voice: a sharp, encouraging money coach texting a friend — warm, direct, a light nudge toward discipline. Never a lecture.
- Lead with what matters most today. If a milestone was hit, lead with it. Otherwise lead with spending.
- Start with a brief greeting (e.g. "Morning, Romano.").`,
  analyst: `You write the one-line morning brief inside Romano's private South African finance app, PWOS. Voice: a calm analyst — figures first, plain and precise, no cheerleading and no nudging. State the position.
- No greeting fluff; open with the most important figure. Neutral tone throughout.`,
  gentle: `You write the one-line morning brief inside Romano's private South African finance app, PWOS. Voice: gentle and reassuring — low-pressure, never a lecture, calm about the numbers. Encourage without pushing.
- Start with a soft greeting (e.g. "Morning."). Frame things kindly, but never hide a bad number.`,
};

const SHARED_RULES = `
Rules for every voice:
- Use ONLY the figures given. Never invent a number, coin, or fact. If a figure isn't given, don't mention it.
- One or two short sentences, 45 words max. No markdown, no bullet points, no emoji, no headings — just the sentence(s).
- South African rand, en-ZA format (e.g. R18 420). Keep the exact figures as given.
- Never soften a loss or an overspend; state it plainly.`;

async function narrate(modelFacts: string[], tone: BriefTone): Promise<string | null> {
  const apiKey = env.anthropicApiKey;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: BRIEF_MODEL,
      max_tokens: 220,
      system: TONE_SYSTEM[tone] + SHARED_RULES,
      messages: [
        {
          role: "user",
          content: `Today's figures:\n${modelFacts.map((f) => `- ${f}`).join("\n")}\n\nWrite today's brief.`,
        },
      ],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    console.error("[brief] narration failed", error);
    return null;
  }
}

let storeEnsured = false;
/** Provision the cache table and the preference columns, once per instance. */
async function ensureBriefStore(): Promise<void> {
  if (storeEnsured) return;
  await sql`
    create table if not exists daily_brief (
      brief_date  date primary key,
      tone        text not null default 'coach',
      source      text not null,
      payload     jsonb not null,
      created_at  timestamptz not null default now()
    )`;
  await sql`
    alter table app_settings
      add column if not exists brief_enabled boolean not null default true,
      add column if not exists brief_tone    text    not null default 'coach',
      add column if not exists brief_budget  boolean not null default true,
      add column if not exists brief_crypto  boolean not null default true,
      add column if not exists brief_debt    boolean not null default true,
      add column if not exists brief_goals   boolean not null default false,
      add column if not exists brief_kids    boolean not null default false`;
  storeEnsured = true;
}

function toTone(value: unknown): BriefTone {
  return BRIEF_TONES.includes(value as BriefTone) ? (value as BriefTone) : "coach";
}

export async function getBriefPrefs(): Promise<BriefPrefs> {
  await ensureBriefStore();
  const rows = await sql<{
    brief_enabled: boolean; brief_tone: string;
    brief_budget: boolean; brief_crypto: boolean; brief_debt: boolean;
    brief_goals: boolean; brief_kids: boolean;
  }>`
    select brief_enabled, brief_tone, brief_budget, brief_crypto, brief_debt,
           brief_goals, brief_kids
    from app_settings where id = true`;
  const r = rows[0];
  return {
    enabled: r?.brief_enabled ?? true,
    tone: toTone(r?.brief_tone),
    include: {
      budget: r?.brief_budget ?? true,
      crypto: r?.brief_crypto ?? true,
      debt: r?.brief_debt ?? true,
      goals: r?.brief_goals ?? false,
      kids: r?.brief_kids ?? false,
    },
  };
}

/** Overwrite the preferences and drop today's cached brief so it regenerates. */
export async function writeBriefPrefs(next: BriefPrefs): Promise<void> {
  await ensureBriefStore();
  await sql`
    update app_settings set
      brief_enabled = ${next.enabled},
      brief_tone    = ${next.tone},
      brief_budget  = ${next.include.budget},
      brief_crypto  = ${next.include.crypto},
      brief_debt    = ${next.include.debt},
      brief_goals   = ${next.include.goals},
      brief_kids    = ${next.include.kids},
      updated_at    = now()
    where id = true`;
  await sql`delete from daily_brief where brief_date = ${toLocalISODate(new Date())}::date`;
}

/** The driver parses jsonb to an object, but tolerate a text return too. */
function asBrief(payload: unknown): DailyBrief {
  return (typeof payload === "string" ? JSON.parse(payload) : payload) as DailyBrief;
}

/**
 * Today's brief — served from cache after the first open, generated once on
 * that first open. Returns null when the brief is switched off or there's
 * nothing to say, in which case the card simply doesn't appear.
 */
export async function getDailyBrief(): Promise<DailyBrief | null> {
  const prefs = await getBriefPrefs();
  if (!prefs.enabled) return null;

  const date = toLocalISODate(new Date());

  const cached = await sql<{ payload: unknown }>`
    select payload from daily_brief where brief_date = ${date}::date`;
  if (cached.length > 0) return asBrief(cached[0].payload);

  const { facts, modelFacts, fallback } = await assemble(prefs.include);
  if (modelFacts.length === 0) return null; // everything switched off — no card

  const narrated = await narrate(modelFacts, prefs.tone);

  const brief: DailyBrief = {
    date,
    greeting: greetingFor(date),
    tone: prefs.tone,
    body: narrated ?? fallback,
    source: narrated ? "ai" : "fallback",
    facts,
  };

  // Only persist a real (model-written) brief — a fallback must be free to
  // retry once the key works. `on conflict do nothing` lets a race resolve to
  // whichever request wrote first; we then re-read so everyone agrees.
  if (brief.source === "ai") {
    await sql`
      insert into daily_brief (brief_date, tone, source, payload)
      values (${date}::date, ${brief.tone}, ${brief.source}, ${JSON.stringify(brief)}::jsonb)
      on conflict (brief_date) do nothing`;
    const settled = await sql<{ payload: unknown }>`
      select payload from daily_brief where brief_date = ${date}::date`;
    if (settled.length > 0) return asBrief(settled[0].payload);
  }

  return brief;
}
