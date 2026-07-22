/**
 * Home — the daily driver (CLAUDE.md §5, revised 2026-07-22).
 *
 * Romano's call: Home is for *operating* the money day to day — what's
 * available, the cards, the budget, and logging what you just spent. Wealth,
 * crypto, goals and investments live in their own modules and are deliberately
 * absent here.
 *
 * The freedom number moved to Goals, where it still leads. §0 called it the
 * centrepiece of Home; in practice Home is opened on a phone in a shop, and a
 * long-term target is the wrong thing to show at that moment.
 *
 * A useful side effect: this no longer touches the portfolio, so Home doesn't
 * wait on CoinGecko or on paging the Holdings table.
 */
import "server-only";

import { getBudgetCycle } from "@/lib/budget";
import { toLocalISODate } from "@/lib/crypto/history";
import { spendContribution } from "@/lib/transactions";

import { getAccounts } from "./accounts";
import { getBudgetSummary } from "./budget";
import { getTransactions } from "./transactions";

export type HomeCard = {
  id: string;
  label: string;
  kind: string;
  spendable: boolean;
  balanceZar: number | null;
  lastActivity: string | null;
};

export type HomeTransaction = {
  recordId: string;
  date: string | null;
  description: string;
  amountZar: number;
  category: string | null;
  accountLabel: string | null;
  type: string;
};

export type HomeSummary = {
  available: { spendableZar: number; totalCashZar: number };
  cards: HomeCard[];
  budget: {
    remainingZar: number;
    budgetedZar: number;
    spentZar: number;
    daysLeft: number;
    dailyAllowanceZar: number | null;
    overspent: boolean;
    cycleStart: string;
    cycleEnd: string;
  };
  today: { spendZar: number; count: number };
  recent: HomeTransaction[];
  /** Smart defaults for the log form — last used account, frequent categories. */
  defaults: { accountLabel: string | null; categories: string[] };
};

export async function getHome(): Promise<HomeSummary> {
  const [accounts, budget, transactions] = await Promise.all([
    getAccounts(),
    getBudgetSummary(),
    getTransactions(),
  ]);

  const cycle = getBudgetCycle();
  const todayIso = toLocalISODate(new Date());

  const todays = transactions.filter((t) => t.date?.slice(0, 10) === todayIso);
  const todaySpend = todays
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + spendContribution(t.amountZar, t.category, t.description), 0);

  // Smart defaults from actual behaviour, not a guess: the account most
  // recently used, and the categories used most in the last 60 days.
  const recentWindow = transactions.filter((t) => {
    if (!t.date) return false;
    const days = (Date.parse(todayIso) - Date.parse(t.date.slice(0, 10))) / 86_400_000;
    return days >= 0 && days <= 60;
  });

  const categoryCounts = new Map<string, number>();
  for (const t of recentWindow) {
    if (t.type !== "expense" || !t.category) continue;
    categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1);
  }

  return {
    available: {
      spendableZar: accounts.totals.spendableZar,
      totalCashZar: accounts.totals.cashZar,
    },
    cards: accounts.accounts
      .filter((a) => a.account.kind !== "crypto")
      .map((a) => ({
        id: a.account.id,
        label: a.account.label,
        kind: a.account.kind,
        spendable: a.account.spendable,
        balanceZar: a.storedZar,
        lastActivity: a.lastActivity,
      })),
    budget: {
      remainingZar: budget.totals.remainingZar,
      budgetedZar: budget.totals.budgetedZar,
      spentZar: budget.totals.actualZar,
      daysLeft: cycle.remainingDays,
      dailyAllowanceZar: budget.dailyAllowanceZar,
      overspent: budget.totals.remainingZar < 0,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
    },
    today: { spendZar: todaySpend, count: todays.length },
    recent: transactions.slice(0, 8).map((t) => ({
      recordId: t.recordId,
      date: t.date,
      description: t.description,
      amountZar: t.amountZar,
      category: t.category,
      accountLabel: t.accountLabel,
      type: t.type,
    })),
    defaults: {
      accountLabel: transactions.find((t) => t.accountLabel)?.accountLabel ?? null,
      categories: [...categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([category]) => category),
    },
  };
}
