/**
 * Home (CLAUDE.md §5) — the freedom number, then the honest picture beneath it.
 *
 * §0 is explicit that R2m is the centrepiece "with true net worth shown
 * honestly beneath it". So progress is measured against total wealth, not
 * crypto alone, and the shortfall is never softened.
 */
import "server-only";

import { FREEDOM_TARGET_ZAR, FREEDOM_TARGET_LABEL } from "@/lib/constants";
import { getBudgetCycle } from "@/lib/budget";

import { getAccounts } from "./accounts";
import { getBudgetSummary } from "./budget";
import { getPortfolio } from "./crypto";
import { getNetWorth } from "./networth";

export type HomeSummary = {
  freedom: {
    targetZar: number;
    targetLabel: string;
    /** Liquid wealth counted toward the goal: crypto + cash + investments. */
    progressZar: number;
    progressPct: number;
    remainingZar: number;
  };
  netWorthZar: number;
  dedupedNetWorthZar: number;
  crypto: { valueZar: number; change24hPct: number | null; pnlZar: number };
  cash: { spendableZar: number; totalZar: number };
  budget: {
    remainingZar: number;
    daysLeft: number;
    dailyAllowanceZar: number | null;
    overspent: boolean;
  };
  nextMilestone: {
    symbol: string;
    level: number;
    distancePct: number;
    instruction: string;
  } | null;
  movers: { symbol: string; change24hPct: number }[];
};

export async function getHome(): Promise<HomeSummary> {
  const [portfolio, accounts, netWorth, budget] = await Promise.all([
    getPortfolio(),
    getAccounts(),
    getNetWorth(),
    getBudgetSummary(),
  ]);

  // The freedom number is a wealth target, so it counts assets — not debt.
  // Net worth is shown separately and honestly beneath it (§0).
  const progressZar = netWorth.assetsZar;
  const cycle = getBudgetCycle();

  const next = portfolio.holdings
    .filter((h) => h.nextMilestone?.distancePct != null)
    .sort(
      (a, b) => (a.nextMilestone!.distancePct ?? 0) - (b.nextMilestone!.distancePct ?? 0),
    )[0];

  return {
    freedom: {
      targetZar: FREEDOM_TARGET_ZAR,
      targetLabel: FREEDOM_TARGET_LABEL,
      progressZar,
      progressPct: (progressZar / FREEDOM_TARGET_ZAR) * 100,
      remainingZar: Math.max(0, FREEDOM_TARGET_ZAR - progressZar),
    },
    netWorthZar: netWorth.netZar,
    dedupedNetWorthZar: netWorth.dedupedNetZar,
    crypto: {
      valueZar: portfolio.totals.valueZar,
      change24hPct: portfolio.totals.change24hPct,
      pnlZar: portfolio.totals.pnlZar,
    },
    cash: { spendableZar: accounts.totals.spendableZar, totalZar: accounts.totals.cashZar },
    budget: {
      remainingZar: budget.totals.remainingZar,
      daysLeft: cycle.remainingDays,
      dailyAllowanceZar: budget.dailyAllowanceZar,
      overspent: budget.totals.remainingZar < 0,
    },
    nextMilestone: next
      ? {
          symbol: next.symbol,
          level: next.nextMilestone!.milestone.level,
          distancePct: next.nextMilestone!.distancePct!,
          instruction: next.nextMilestone!.milestone.raw,
        }
      : null,
    movers: [...portfolio.gainers.slice(0, 3), ...portfolio.losers.slice(0, 2)].map((m) => ({
      symbol: m.symbol,
      change24hPct: m.change24hPct,
    })),
  };
}
