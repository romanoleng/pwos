/** Goals (CLAUDE.md §5) — freedom goal, savings goals, kids' accounts. */
import "server-only";

import { FREEDOM_TARGET_LABEL, FREEDOM_TARGET_ZAR } from "@/lib/constants";
import { isKidInvestment } from "@/lib/kids";

import { cutoverFloor } from "./cutover";
import { getCurrentCycle } from "./cycle";
import { isoDate, money, moneyOrNull, sql } from "./db";
import { getNetWorth } from "./networth";

export type Goal = {
  recordId: string; name: string; currentZar: number; targetZar: number | null;
  monthlyZar: number; progressPct: number | null; status: string | null;
  priority: string | null; targetDate: string | null; monthsToTarget: number | null;
};

export type KidAccount = {
  recordId: string; account: string; child: string | null;
  institution: string | null; accountType: string | null;
  balanceZar: number; monthlyZar: number;
};

export type GoalsSummary = {
  freedom: { targetZar: number; label: string; currentZar: number; progressPct: number };
  goals: Goal[]; kids: KidAccount[];
  /**
   * What he plans to put away this cycle. These left the budget — putting money
   * away isn't spending it — but they're still a monthly commitment, so they
   * live beside the goals they fund.
   */
  planned: { recordId: string; category: string; plannedZar: number; actualZar: number }[];
  totals: {
    savedZar: number; targetZar: number; monthlyZar: number;
    kidsZar: number; kidsMonthlyZar: number;
    kidsInvestedZar: number; kidsSavedZar: number;
  };
};

function monthsToTarget(current: number, target: number | null, monthly: number) {
  if (!target || monthly <= 0 || current >= target) return null;
  return Math.ceil((target - current) / monthly);
}

export async function getGoals(): Promise<GoalsSummary> {
  // The same cycle every other screen uses — not `max(cycle_start)`, which a
  // future-dated budget row would push past the current cycle.
  const cycle = await getCurrentCycle();
  const floor = await cutoverFloor();
  const [goalRows, kidRows, netWorth, plannedRows] = await Promise.all([
    sql<{ id: string; name: string; current_zar: string; target_zar: string | null;
          monthly_zar: string; priority: string | null; status: string | null; target_date: string | null }>`
      select id::text, name, current_zar, target_zar, monthly_zar, priority, status, target_date::text
      from goals where not archived order by current_zar desc`,
    sql<{ id: string; account: string; child: string | null; institution: string | null;
          account_type: string | null; balance_zar: string; monthly_zar: string }>`
      select id::text, account, child, institution, account_type, balance_zar, monthly_zar
      from kids_accounts order by child, monthly_zar desc, balance_zar desc`,
    getNetWorth(),
    sql<{ id: string; category: string; budgeted_zar: string; actual_zar: string }>`
      select b.id::text, b.category, b.budgeted_zar,
             coalesce(sum(-t.amount_zar), 0) as actual_zar
      from budgets b
      join categories c on c.name = b.category and c.kind = 'contribution'
      left join transactions t
        on t.category = b.category and t.type = 'contribution'
       and t.occurred_on >= ${cycle.start}::date
       and t.occurred_on <  ${cycle.end}::date
       and (${floor}::date is null or t.occurred_on >= ${floor}::date)
      where b.cycle_start = ${cycle.start}::date
      group by b.id, b.category, b.budgeted_zar
      order by b.budgeted_zar desc`,
  ]);

  const goals: Goal[] = goalRows.map((r) => {
    const currentZar = money(r.current_zar);
    const targetZar = moneyOrNull(r.target_zar);
    const monthlyZar = money(r.monthly_zar);
    return {
      recordId: r.id, name: r.name, currentZar, targetZar, monthlyZar,
      progressPct: targetZar && targetZar > 0 ? (currentZar / targetZar) * 100 : null,
      status: r.status, priority: r.priority, targetDate: isoDate(r.target_date),
      monthsToTarget: monthsToTarget(currentZar, targetZar, monthlyZar),
    };
  });

  const kids: KidAccount[] = kidRows.map((r) => ({
    recordId: r.id, account: r.account, child: r.child,
    institution: r.institution, accountType: r.account_type,
    balanceZar: money(r.balance_zar), monthlyZar: money(r.monthly_zar),
  }));

  return {
    freedom: {
      targetZar: FREEDOM_TARGET_ZAR, label: FREEDOM_TARGET_LABEL,
      currentZar: netWorth.assetsZar,
      progressPct: (netWorth.assetsZar / FREEDOM_TARGET_ZAR) * 100,
    },
    goals, kids,
    planned: plannedRows.map((r) => ({
      recordId: r.id, category: r.category,
      plannedZar: money(r.budgeted_zar), actualZar: money(r.actual_zar),
    })),
    totals: {
      savedZar: goals.reduce((t, g) => t + g.currentZar, 0),
      targetZar: goals.reduce((t, g) => t + (g.targetZar ?? 0), 0),
      monthlyZar: goals.reduce((t, g) => t + g.monthlyZar, 0),
      kidsZar: kids.reduce((t, k) => t + k.balanceZar, 0),
      kidsMonthlyZar: kids.reduce((t, k) => t + k.monthlyZar, 0),
      kidsInvestedZar: kids
        .filter((k) => isKidInvestment(k.accountType))
        .reduce((t, k) => t + k.balanceZar, 0),
      kidsSavedZar: kids
        .filter((k) => !isKidInvestment(k.accountType))
        .reduce((t, k) => t + k.balanceZar, 0),
    },
  };
}
