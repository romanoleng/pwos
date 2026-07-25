/**
 * The daily brief — a card at the top of Home that greets Romano once a day
 * with what matters (Romano's ask, 2026-07-25). Coach voice by default.
 *
 * Cost discipline (the whole reason it's built this way):
 *  - The FIGURES are computed by the app, never by the model — so they're
 *    always exact and can't be hallucinated. The model only writes the
 *    sentence around them.
 *  - That sentence is generated ONCE per day, on the first open, and cached in
 *    `daily_brief`. Every later open that day re-serves the stored snapshot —
 *    no new API call. One Haiku call a day keeps months of use inside a few
 *    dollars of credit.
 *  - If the model is unreachable (no key, no credit), a deterministic Coach
 *    sentence stands in and is NOT cached, so it retries — and starts using the
 *    model again — the moment the key is fixed.
 *
 * The brief is a morning snapshot: the sentence and the chips are captured at
 * the same moment and stored together, so they never drift apart as the day's
 * spending and prices move.
 */
import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { toLocalISODate } from "@/lib/crypto/history";

import { getPortfolio } from "./crypto";
import { sql } from "./db";
import { env } from "./env";
import { getHome } from "./home";

const BRIEF_MODEL = "claude-haiku-4-5";

export type BriefTone = "coach" | "analyst" | "gentle";

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

/** The facts the card shows and the sentence is built from. Always exact. */
type Assembled = {
  facts: BriefFact[];
  /** Compact fact list handed to the model — plain figures, nothing backend. */
  modelFacts: string[];
  /** Deterministic Coach sentence for when the model can't be reached. */
  fallback: string;
};

async function assemble(): Promise<Assembled> {
  const home = await getHome("cycle");

  // The portfolio touches CoinGecko and can be slow or down; the brief must
  // never hinge on it, so a miss just drops the crypto line.
  let portfolio: Awaited<ReturnType<typeof getPortfolio>> | null = null;
  try {
    portfolio = await getPortfolio();
  } catch (error) {
    console.error("[brief] portfolio unavailable", error);
  }

  const facts: BriefFact[] = [];
  const modelFacts: string[] = [];

  const spend = home.available.spendableZar;
  facts.push({ key: "spend", label: "To spend", kind: "money", amount: spend });
  modelFacts.push(`Spendable cash right now: ${rand(spend)}.`);

  const perDay = home.budget.dailyAllowanceZar;
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
  } else {
    facts.push({ key: "perday", label: "Per day", kind: "money", amount: perDay });
    if (perDay !== null) {
      modelFacts.push(
        `Budget left works out to ${rand(perDay)} a day for the ${home.budget.daysLeft} days left in the cycle.`,
      );
    }
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
      modelFacts.push(
        `Biggest 24h mover is ${topMover.symbol} at ${signedPct(topMover.change24hPct)}.`,
      );
    }
    if (portfolio.milestoneHits.length > 0) {
      const syms = [...new Set(portfolio.milestoneHits.map((h) => h.symbol))].join(", ");
      modelFacts.push(
        `MILESTONE HIT — ${syms} has crossed a sell/keep trigger and needs a look on the Crypto screen.`,
      );
    }
  }

  facts.push({
    key: "payday",
    label: "To payday",
    kind: "text",
    value: `${home.budget.daysLeft}d`,
  });

  // Deterministic Coach fallback, assembled from the same facts.
  const bits: string[] = ["Morning, Romano."];
  if (home.budget.overspent) {
    bits.push(
      `You're ${rand(Math.abs(home.budget.remainingZar))} over budget with ${home.budget.daysLeft} days left — ease off where you can.`,
    );
  } else if (perDay !== null) {
    bits.push(
      `You've got ${rand(spend)} to spend — about ${rand(perDay)} a day for the next ${home.budget.daysLeft} days.`,
    );
  } else {
    bits.push(`You've got ${rand(spend)} to spend this cycle.`);
  }
  if (portfolio && portfolio.totals.change24hPct !== null) {
    const c = portfolio.totals.change24hPct;
    const dir = c > 0 ? "up" : c < 0 ? "down" : "flat";
    bits.push(
      portfolio.milestoneHits.length > 0
        ? `Crypto's ${dir} ${signedPct(c)} today — and a coin's hit a milestone, worth a look.`
        : `Crypto's ${dir} ${signedPct(c)} today.`,
    );
  }

  return { facts, modelFacts, fallback: bits.join(" ") };
}

const COACH_SYSTEM = `You write the one-line morning brief inside Romano's private South African finance app, PWOS. Voice: a sharp, encouraging money coach texting a friend — warm, direct, a light nudge toward discipline. Never a lecture.

Rules:
- Use ONLY the figures given. Never invent a number, coin, or fact. If a figure isn't given, don't mention it.
- One or two short sentences, 40 words max. No markdown, no bullet points, no emoji, no headings — just the sentence(s).
- South African rand, en-ZA format (e.g. R18 420). Keep the exact figures as given.
- Lead with what matters most today. If a milestone was hit, mention it — it's the most important thing. Otherwise lead with spending.
- Start with a brief greeting to Romano (e.g. "Morning, Romano.").`;

async function narrate(modelFacts: string[]): Promise<string | null> {
  const apiKey = env.anthropicApiKey;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: BRIEF_MODEL,
      max_tokens: 200,
      system: COACH_SYSTEM,
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

/** The driver parses jsonb to an object, but tolerate a text return too. */
function asBrief(payload: unknown): DailyBrief {
  return (typeof payload === "string" ? JSON.parse(payload) : payload) as DailyBrief;
}

let tableEnsured = false;
async function ensureBriefTable(): Promise<void> {
  if (tableEnsured) return;
  await sql`
    create table if not exists daily_brief (
      brief_date  date primary key,
      tone        text not null default 'coach',
      source      text not null,
      payload     jsonb not null,
      created_at  timestamptz not null default now()
    )`;
  tableEnsured = true;
}

/**
 * Today's brief — served from cache after the first open, generated once on
 * that first open. A fallback (model unreachable) is returned but not cached,
 * so it retries next open.
 */
export async function getDailyBrief(): Promise<DailyBrief> {
  const date = toLocalISODate(new Date());
  await ensureBriefTable();

  const cached = await sql<{ payload: unknown }>`
    select payload from daily_brief where brief_date = ${date}::date`;
  if (cached.length > 0) return asBrief(cached[0].payload);

  const { facts, modelFacts, fallback } = await assemble();
  const narrated = await narrate(modelFacts);

  const brief: DailyBrief = {
    date,
    greeting: greetingFor(date),
    tone: "coach",
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
