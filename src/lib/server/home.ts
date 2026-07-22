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

import { getAccounts } from "./accounts";
import { getBudgetSummary } from "./budget";
import { money, sql } from "./db";

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
  defaults: {
    accountLabel: string | null;
    categories: string[];
    /** Past descriptions, most frequent first, for autocomplete. */
    descriptions: string[];
    /** Real accounts from the database — never a hardcoded list. */
    accounts: { label: string; kind: string }[];
    /** Every category, so the picker matches the database exactly. */
    allCategories: { name: string; kind: string }[];
  };
};

export async function getHome(): Promise<HomeSummary> {
  const todayIso0 = toLocalISODate(new Date());
  const [accounts, budget, recentRows, todayRow, catRows, descRows, accountRows, allCatRows] = await Promise.all([
    getAccounts(),
    getBudgetSummary(),
    sql<{ id: string; occurred_on: string; description: string; amount_zar: string;
          category: string | null; account_label: string | null; type: string }>`
      select t.id::text, t.occurred_on::text, t.description, t.amount_zar,
             t.category, a.label as account_label, t.type::text
      from transactions t left join accounts a on a.id = t.account_id
      order by t.occurred_on desc, t.id desc limit 8`,
    sql<{ spend: string; n: string }>`
      select coalesce(sum(-amount_zar) filter (where type='expense'),0) as spend,
             count(*)::text as n
      from transactions where occurred_on = ${todayIso0}::date`,
    // Pinned categories first — chosen deliberately rather than inferred from
    // frequency, which surfaced duplicate-inflated and debit-order lines while
    // missing the things actually bought in a shop.
    sql<{ name: string }>`
      select name from categories where pinned order by sort_order`,
    sql<{ description: string }>`
      select description from transactions
      where occurred_on >= current_date - 60
      group by description order by count(*) desc limit 40`,
    sql<{ label: string; kind: string }>`
      select label, kind::text from accounts
      where not archived order by kind, label`,
    sql<{ name: string; kind: string }>`
      select name, kind::text from categories order by kind, sort_order, name`,
  ]);

  const cycle = getBudgetCycle();

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
    today: { spendZar: money(todayRow[0]?.spend), count: Number(todayRow[0]?.n ?? 0) },
    recent: recentRows.map((t) => ({
      recordId: t.id,
      date: String(t.occurred_on).slice(0, 10),
      description: t.description,
      amountZar: money(t.amount_zar),
      category: t.category,
      accountLabel: t.account_label,
      type: t.type,
    })),
    defaults: {
      accountLabel: recentRows.find((t) => t.account_label)?.account_label ?? null,
      categories: catRows.map((r) => r.name),
      // Most-repeated descriptions first: "Checkers Sixty60" should not be
      // typed for the hundredth time.
      descriptions: descRows.map((r) => r.description),
      accounts: accountRows,
      allCategories: allCatRows,
    },
  };
}
