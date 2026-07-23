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

import { toLocalISODate } from "@/lib/crypto/history";

import { getAccounts } from "./accounts";
import {
  ensureLogMeta,
  getLogFrequencies,
  getQuickLinks,
  type LogFrequencies,
  type QuickLink,
} from "./logmeta";
import { applyDueScheduledMoves } from "./scheduled";
import { getBudgetSummary } from "./budget";
import { resolvePeriod, type PeriodKind } from "@/lib/period";

import { cutoverFloor } from "./cutover";
import { getCurrentCycle, getCycleBounds } from "./cycle";
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
  /** Loaded so an edit opened from Home can't silently clear these. */
  subcategory: string | null;
  notes: string | null;
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
  /** Entries dated ahead of today — logged early, not yet happened. */
  scheduled: { count: number; nextDate: string | null; totalZar: number };
  /** Whatever range is selected at the top of the screen. */
  period: {
    kind: PeriodKind; start: string | null; end: string; label: string;
    spentZar: number; incomeZar: number; count: number;
  };
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
    /** Lisa's and Liam's accounts — valid transfer destinations. */
    kidAccounts: { id: string; child: string | null; account: string }[];
    /** Start of the cycle in progress. */
    cycleStart: string;
    /** The current cycle has run its course, so income likely opens a new one. */
    suggestsNewCycle: boolean;
    /** Configurable one-tap chips: category, or category + subcategory. */
    quickLinks: QuickLink[];
    /** Week-stable frequency rankings for the chip rows and autocomplete. */
    frequent: LogFrequencies;
  };
};

const NO_FREQUENCIES: LogFrequencies = {
  accounts: [],
  subcategoriesByCategory: {},
  descriptionsByCategory: {},
};

export async function getHome(
  periodKind: PeriodKind = "cycle",
): Promise<HomeSummary> {
  // Home is the most-opened screen, so it is where scheduled entries whose
  // date has arrived get their balances applied — before anything is read.
  await applyDueScheduledMoves();

  // Same reasoning for the log-sheet metadata (subcategories, quick links):
  // provisioned here, tolerated everywhere. Home must render even if the
  // provisioning is refused, so failures degrade to empty chips.
  let quickLinks: QuickLink[] = [];
  let frequent = NO_FREQUENCIES;
  try {
    await ensureLogMeta();
    [quickLinks, frequent] = await Promise.all([getQuickLinks(), getLogFrequencies()]);
  } catch (error) {
    console.error("[getHome] log metadata unavailable", error);
  }

  const todayIso = toLocalISODate(new Date());
  const [accounts, budget, recentRows, todayRow, scheduledRow, catRows, descRows, accountRows, allCatRows, kidRows] =
    await Promise.all([
    getAccounts(),
    getBudgetSummary(),
    sql<{ id: string; occurred_on: string; description: string; amount_zar: string;
          category: string | null; subcategory: string | null; notes: string | null;
          account_label: string | null; type: string }>`
      select t.id::text, t.occurred_on::text, t.description, t.amount_zar,
             t.category, t.subcategory, t.notes, a.label as account_label, t.type::text
      from transactions t left join accounts a on a.id = t.account_id
      where t.occurred_on <= ${todayIso}::date
      order by t.occurred_on desc, t.id desc limit 8`,
    sql<{ spend: string; n: string }>`
      select coalesce(sum(-amount_zar) filter (where type='expense'),0) as spend,
             count(*)::text as n
      from transactions where occurred_on = ${todayIso}::date`,
    sql<{ n: string; next: string | null; total: string }>`
      select count(*)::text as n, min(occurred_on)::text as next,
             coalesce(sum(amount_zar), 0) as total
      from transactions where occurred_on > ${todayIso}::date`,
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
    sql<{ id: string; child: string | null; account: string }>`
      select id::text, child, account from kids_accounts order by child, account`,
  ]);

  const cycle = await getCurrentCycle();

  // The selected range, and what it actually contains. Resolved server-side so
  // the figures and the label can never describe different windows.
  const bounds = await getCycleBounds();
  const floor = await cutoverFloor();
  const period = resolvePeriod(periodKind, todayIso, bounds);
  // A period reaching back past the reset still stops at it.
  const periodStart =
    floor === null ? period.start
    : period.start === null ? floor
    : period.start > floor ? period.start : floor;
  const [periodRow] = await sql<{ spend: string; income: string; n: string }>`
    select
      coalesce(sum(-amount_zar) filter (where type = 'expense'), 0) as spend,
      coalesce(sum(amount_zar)  filter (where type = 'income'),  0) as income,
      count(*) filter (where type in ('expense','income'))         as n
    from transactions
    where occurred_on < ${period.end}::date
      and (${periodStart}::date is null or occurred_on >= ${periodStart}::date)`;

  return {
    period: {
      kind: period.kind, start: period.start, end: period.end, label: period.label,
      spentZar: money(periodRow.spend),
      incomeZar: money(periodRow.income),
      count: Number(periodRow.n),
    },
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
    // Spend is ALL real expenses this cycle, budgeted lines plus anything spent
    // in a category with no line — money out is money out. Leaving unbudgeted
    // spend off (as this once did) overstated "budget left" and the per-day
    // allowance, and disagreed with the period figure on the same screen.
    budget: (() => {
      const spentZar = budget.totals.actualZar + budget.unbudgetedZar;
      const remainingZar = budget.totals.budgetedZar - spentZar;
      return {
        remainingZar,
        budgetedZar: budget.totals.budgetedZar,
        spentZar,
        daysLeft: cycle.remainingDays,
        dailyAllowanceZar:
          cycle.remainingDays > 0 ? remainingZar / cycle.remainingDays : null,
        overspent: remainingZar < 0,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
      };
    })(),
    today: { spendZar: money(todayRow[0]?.spend), count: Number(todayRow[0]?.n ?? 0) },
    scheduled: {
      count: Number(scheduledRow[0]?.n ?? 0),
      nextDate: scheduledRow[0]?.next ?? null,
      totalZar: money(scheduledRow[0]?.total),
    },
    recent: recentRows.map((t) => ({
      recordId: t.id,
      date: String(t.occurred_on).slice(0, 10),
      description: t.description,
      amountZar: money(t.amount_zar),
      category: t.category,
      subcategory: t.subcategory,
      notes: t.notes,
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
      kidAccounts: kidRows,
      cycleStart: cycle.start,
      suggestsNewCycle: cycle.elapsedDays >= 20,
      quickLinks,
      frequent,
    },
  };
}
