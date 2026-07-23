/**
 * The in-app "Ask" assistant (Tier-1, read-only).
 *
 * This is the first, deliberately small step toward the wealth-OS vision: an
 * assistant that understands *this* person's money and answers questions about
 * it in plain language. V1 is read-only by construction — see the guardrails.
 *
 * Guardrails (why this can't leak the backend or mutate anything):
 *  1. NO tools are passed to the model. Read-only isn't a policy the model is
 *     asked to honour — it physically has no way to call anything, so it cannot
 *     write to the database or reach any external system. It can only talk.
 *  2. The prompt carries a *compact financial snapshot* — the same figures the
 *     screens already show — never secrets, connection strings, table names,
 *     column ids, or env vars. There is nothing backend-shaped in the context
 *     for it to reveal.
 *  3. The system prompt scopes it hard to Romano's PWOS finances and tells it
 *     to decline anything else (code, the app's internals, general chit-chat).
 *  4. The route that calls this is behind the same auth gate as every other
 *     `/api/` route (src/proxy.ts), so only the signed-in user reaches it.
 */
import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { FREEDOM_TARGET_LABEL, FREEDOM_TARGET_ZAR } from "@/lib/constants";

import { getBudgetSummary } from "./budget";
import { getPortfolio } from "./crypto";
import { getDebtSummary } from "./debt";
import { env } from "./env";
import { getGoals } from "./goals";
import { getHome } from "./home";
import { getNetWorth } from "./networth";

/**
 * The model behind Ask. Haiku is the cheapest tier (~5× cheaper than Opus) and
 * more than sharp enough for personal-finance Q&A over a small snapshot — so a
 * few dollars of API credit stretch to months of use. Bump this to a Sonnet or
 * Opus id if answers ever need more depth.
 */
const ASSISTANT_MODEL = "claude-haiku-4-5";

/** A single turn in the conversation. Only these two roles are ever accepted. */
export type AssistantTurn = { role: "user" | "assistant"; content: string };

export class AssistantNotConfiguredError extends Error {
  constructor() {
    super("The assistant isn't set up yet — ANTHROPIC_API_KEY is missing.");
    this.name = "AssistantNotConfiguredError";
  }
}

/**
 * A failure with a message safe to show Romano. Carries a short, actionable
 * reason (invalid key, no model access, out of credit) rather than a blank
 * "try again" — this is a private single-user app, so a named cause costs far
 * less to fix than a silent one.
 */
export class AssistantReplyError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = "AssistantReplyError";
  }
}

/** Turn an SDK/API failure into something Romano can act on. */
function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    if (status === 401) {
      return "Your Claude API key was rejected. Check ANTHROPIC_API_KEY in Vercel — it may be mistyped or from the wrong account.";
    }
    if (status === 403) {
      return "That Claude API key doesn't have access to this model. Check the key's permissions at console.anthropic.com.";
    }
    if (status === 404) {
      return "The assistant's model isn't available on your account. This usually means the account needs model access enabled.";
    }
    if (status === 429) {
      return "You're out of Claude API credit or hitting a rate limit. Add credit at console.anthropic.com → Billing, then try again.";
    }
    if (status === 400) {
      return `The request was rejected: ${error.message}`;
    }
    return `Claude API error (${status ?? "network"}): ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error.";
}

/** en-ZA rand, no cents — matches how figures read across the app. */
function rand(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  return `${value.toFixed(1)}%`;
}

/** Coin quantities: enough precision for dust, trimmed of trailing zeros. */
function qty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const decimals = value >= 1 ? 4 : 8;
  return Number(value.toFixed(decimals)).toString();
}

/**
 * The financial snapshot the model reasons over. Deliberately built from the
 * same summary functions the screens use, so the assistant can never be more
 * (or less) informed than what Romano sees. Plain figures only — nothing that
 * describes the backend.
 */
async function buildContext(): Promise<string> {
  const [home, budget, netWorth, debt, goals, portfolio] = await Promise.all([
    getHome("cycle"),
    getBudgetSummary(),
    getNetWorth(),
    getDebtSummary(),
    getGoals(),
    getPortfolio(),
  ]);

  const lines: string[] = [];

  lines.push("## Available to spend right now");
  lines.push(`- Spendable (reachable cash): ${rand(home.available.spendableZar)}`);
  lines.push(`- Total cash across accounts: ${rand(home.available.totalCashZar)}`);

  lines.push("");
  lines.push("## Accounts");
  for (const card of home.cards) {
    const bal = card.balanceZar === null ? "not recorded" : rand(card.balanceZar);
    lines.push(`- ${card.label} (${card.kind}${card.spendable ? ", spendable" : ""}): ${bal}`);
  }

  lines.push("");
  lines.push("## This budget cycle");
  lines.push(`- Cycle: ${home.budget.cycleStart} to ${home.budget.cycleEnd}, ${home.budget.daysLeft} days left`);
  lines.push(`- Budgeted: ${rand(budget.totals.budgetedZar)}, spent: ${rand(budget.totals.actualZar)}, remaining: ${rand(budget.totals.remainingZar)}`);
  if (home.budget.dailyAllowanceZar !== null) {
    lines.push(`- Per-day allowance for the rest of the cycle: ${rand(home.budget.dailyAllowanceZar)}`);
  }
  lines.push(`- Income this cycle: ${rand(budget.totals.incomeZar)}`);
  if (budget.lines.length > 0) {
    lines.push("- By category (spent / budgeted):");
    for (const line of budget.lines) {
      lines.push(`  - ${line.category}: ${rand(line.actualZar)} / ${rand(line.budgetedZar)}`);
    }
  }
  if (budget.unbudgetedZar > 0) {
    lines.push(`- Spent outside any budget line: ${rand(budget.unbudgetedZar)}`);
  }

  lines.push("");
  lines.push("## Net worth (derived live)");
  lines.push(`- Assets: ${rand(netWorth.assetsZar)}, liabilities: ${rand(netWorth.liabilitiesZar)}, net: ${rand(netWorth.netZar)}`);
  lines.push("- Assets by class:");
  for (const cls of netWorth.classes) {
    lines.push(`  - ${cls.category}: ${rand(cls.valueZar)}${cls.live ? " (live)" : ""}`);
  }

  // Crypto per coin, aggregated across every wallet a coin sits in (a coin can
  // appear in several). Live prices; this is what answers "what's my TIA worth".
  const byCoin = new Map<
    string,
    { qty: number; valueZar: number; investedZar: number; priceZar: number | null }
  >();
  for (const h of portfolio.holdings) {
    const entry =
      byCoin.get(h.symbol) ?? { qty: 0, valueZar: 0, investedZar: 0, priceZar: h.priceZar };
    entry.qty += h.quantity;
    entry.valueZar += h.valueZar ?? 0;
    entry.investedZar += h.investedZar ?? 0;
    if (h.priceZar !== null) entry.priceZar = h.priceZar;
    byCoin.set(h.symbol, entry);
  }
  const coins = [...byCoin.entries()].sort((a, b) => b[1].valueZar - a[1].valueZar);

  // Nearest un-hit milestone per coin, with its verbatim sell/keep instruction —
  // so the assistant can advise against Romano's OWN plan, not invent targets.
  const nextMs = new Map<
    string,
    { level: number; triggerZar: number; distancePct: number | null; raw: string }
  >();
  for (const h of portfolio.holdings) {
    const ms = h.nextMilestone;
    if (!ms || ms.milestone.triggerZar === null) continue;
    const current = nextMs.get(h.symbol);
    if (!current || (ms.distancePct ?? Infinity) < (current.distancePct ?? Infinity)) {
      nextMs.set(h.symbol, {
        level: ms.milestone.level,
        triggerZar: ms.milestone.triggerZar,
        distancePct: ms.distancePct,
        raw: ms.milestone.raw,
      });
    }
  }

  lines.push("");
  lines.push("## Crypto portfolio");
  lines.push(
    `- Total value: ${rand(portfolio.totals.valueZar)}, invested: ${rand(portfolio.totals.investedZar)}, unrealised P&L: ${rand(portfolio.totals.pnlZar)} (${pct(portfolio.totals.pnlPct)})`,
  );
  if (portfolio.totals.pnlExcludedCount > 0) {
    lines.push(
      `- The P&L above is measured only over positions that have a cost basis and a price; ${portfolio.totals.pnlExcludedCount} position(s) are excluded (no cost entered or no price), so it isn't softened by those gaps.`,
    );
  }
  if (portfolio.milestoneHits.length > 0) {
    lines.push(
      `- MILESTONE HIT (price has crossed a trigger, not yet actioned): ${portfolio.milestoneHits.map((h) => h.symbol).join(", ")}`,
    );
  }
  if (coins.length > 0) {
    lines.push("- Holdings by coin (quantity · current value · invested/cost · P&L · unit price · next milestone):");
    for (const [symbol, e] of coins) {
      const pnl = e.valueZar - e.investedZar;
      const ms = nextMs.get(symbol);
      const milestone = ms
        ? ` · next M${ms.level} at ${rand(ms.triggerZar)}${ms.distancePct !== null ? ` (needs ${ms.distancePct >= 0 ? "+" : ""}${ms.distancePct.toFixed(0)}%)` : ""} — plan: "${ms.raw}"`
        : "";
      lines.push(
        `  - ${symbol}: ${qty(e.qty)} · value ${rand(e.valueZar)} · invested ${rand(e.investedZar)} · P&L ${rand(pnl)} · ${rand(e.priceZar)} each${milestone}`,
      );
    }
    lines.push(
      "- Note: some coins show R0 invested where the cost basis hasn't been entered yet — say so rather than treating it as a real zero. M5 is the hard Feb-2028 full exit; there are no breakeven sells.",
    );
  }

  lines.push("");
  lines.push("## Debt");
  lines.push(`- Total owed: ${rand(debt.totalZar)}, monthly commitment: ${rand(debt.monthlyZar)}`);
  if (debt.estimatedZar > 0) {
    lines.push(`- Of which estimated (not statement figures): ${rand(debt.estimatedZar)}`);
  }
  if (debt.duplicates.length > 0) {
    lines.push(`- ${debt.duplicates.length} possible duplicate debt(s) flagged — not yet confirmed or merged.`);
  }
  for (const row of debt.rows) {
    const est = row.balanceEstimated ? " (estimated)" : "";
    lines.push(`  - ${row.name}: ${rand(row.balanceZar)}${est}, ${rand(row.monthlyZar)}/mo`);
  }

  lines.push("");
  lines.push("## The freedom goal");
  lines.push(`- Target: ${rand(FREEDOM_TARGET_ZAR)} by ${FREEDOM_TARGET_LABEL}`);
  lines.push(
    `- Progress is measured by NET WORTH (assets minus debt), because the R2m is meant to clear the home loan and debt review. Current: ${rand(goals.freedom.currentZar)} (${pct(goals.freedom.progressPct)}). This can be below zero while debt outweighs assets — don't dress that up.`,
  );

  if (goals.goals.length > 0) {
    lines.push("");
    lines.push("## Savings goals");
    for (const goal of goals.goals) {
      const target = goal.targetZar ? ` / ${rand(goal.targetZar)}` : "";
      lines.push(`- ${goal.name}: ${rand(goal.currentZar)}${target}, ${rand(goal.monthlyZar)}/mo`);
    }
  }

  if (goals.kids.length > 0) {
    lines.push("");
    lines.push("## Lisa & Liam's accounts (Romano's children)");
    lines.push(
      `- Tracked in the app but deliberately kept out of Romano's own net worth. Total held: ${rand(goals.totals.kidsZar)}.`,
    );
    for (const kid of goals.kids) {
      const where = [kid.child, kid.institution, kid.accountType].filter(Boolean).join(" · ");
      const monthly = kid.monthlyZar > 0 ? `, ${rand(kid.monthlyZar)}/mo` : "";
      lines.push(`- ${kid.account}${where ? ` (${where})` : ""}: ${rand(kid.balanceZar)}${monthly}`);
    }
  }

  if (home.recent.length > 0) {
    lines.push("");
    lines.push("## Recent transactions");
    for (const t of home.recent) {
      const cat = t.category ? ` [${t.category}]` : "";
      lines.push(`- ${t.date ?? "—"}: ${t.description}${cat} ${rand(t.amountZar)} (${t.type})`);
    }
  }

  return lines.join("\n");
}

const SYSTEM_PREAMBLE = `You are the assistant inside PWOS, Romano's private Personal Wealth Operating System — a South African personal-finance app. You help Romano understand his own money.

Rules:
- Answer ONLY using the financial snapshot below. It is Romano's real, current data.
- You are read-only. You cannot change anything, log transactions, or take actions — if asked to, explain that this version can only answer questions, and tell him which screen to use (e.g. "tap the + button to log a spend").
- Your job is to know EVERYTHING the app tracks and answer accurately from it. That includes his children Lisa and Liam and their accounts, which the app tracks as part of the family's finances — answer freely about them; they are in scope, not "someone else's money". The snapshot below is the source of truth; if a figure is in it, use it.
- On crypto you act like his portfolio manager: discuss holdings, P&L, weightings, movers and especially his milestones (M1–M5 sell/keep triggers). Explain how close each coin is to its next trigger and what HIS OWN recorded plan says to do at it — quote the plan text. Do not invent new price targets or give generic buy/sell calls beyond what his milestones state. Milestone discipline is sacred: no breakeven sells; M5 is the hard February-2028 full exit. Frame it as his plan, not your advice.
- Stay on the family's finances as the app records them: budget, spending, accounts, debt, savings, net worth, crypto, the kids' accounts, and the R2,000,000 freedom goal. Politely decline only genuinely unrelated things — coding, the app's internals or how it's built, general knowledge, or strangers' finances.
- Never discuss or speculate about the app's technical implementation, databases, servers, code, or configuration. You don't have that information and it isn't your job.
- Money is in South African rand (ZAR). Use the en-ZA format, e.g. R1 234. Amounts are shown without cents.
- Be concise, warm and direct — like a sharp financial coach texting back. Short paragraphs or tight bullet points. Lead with the answer.
- If the snapshot doesn't contain what's needed to answer, say so plainly rather than guessing. Don't invent figures.
- The goal is the freedom number: R2,000,000 by February 2028, which clears the home loan and debt. When it helps, connect his question back to that.

Here is Romano's current financial snapshot:

`;

/**
 * Ask the assistant a question. `history` is the running conversation (oldest
 * first); the latest user turn must be last. Returns the assistant's reply text.
 *
 * No `tools` array is passed — that's the read-only guarantee, not a request.
 */
export async function askAssistant(history: AssistantTurn[]): Promise<string> {
  const apiKey = env.anthropicApiKey;
  if (!apiKey) throw new AssistantNotConfiguredError();

  // Assembling the snapshot and calling the model are separate failure modes.
  // Keep them apart so a stumbling upstream (e.g. a slow price feed) can't be
  // misreported as an API-key problem, and vice versa.
  let context: string;
  try {
    context = await buildContext();
  } catch (error) {
    console.error("[assistant] context build failed", error);
    throw new AssistantReplyError(
      "Couldn't read your latest figures just now. Try again in a moment.",
    );
  }

  const client = new Anthropic({ apiKey });
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PREAMBLE + context,
      messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
    });
  } catch (error) {
    console.error("[assistant] model call failed", error);
    throw new AssistantReplyError(describeApiError(error));
  }

  // Concatenate the text blocks; a read-only reply is text only, but be tolerant.
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}
