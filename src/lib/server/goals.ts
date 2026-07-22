/** Goals (CLAUDE.md §5) — freedom goal, savings goals, kids' accounts. */
import "server-only";

import { FREEDOM_TARGET_LABEL, FREEDOM_TARGET_ZAR } from "@/lib/constants";

import { isoDate, money, moneyOrNull, sql } from "./db";
import { getNetWorth } from "./networth";

export type Goal = {
  recordId: string; name: string; currentZar: number; targetZar: number | null;
  monthlyZar: number; progressPct: number | null; status: string | null;
  priority: string | null; targetDate: string | null; monthsToTarget: number | null;
};

export type KidAccount = {
  recordId: string; account: string; child: string | null;
  institution: string | null; balanceZar: number; monthlyZar: number;
};

export type GoalsSummary = {
  freedom: { targetZar: number; label: string; currentZar: number; progressPct: number };
  goals: Goal[]; kids: KidAccount[];
  totals: { savedZar: number; targetZar: number; monthlyZar: number; kidsZar: number };
};

function monthsToTarget(current: number, target: number | null, monthly: number) {
  if (!target || monthly <= 0 || current >= target) return null;
  return Math.ceil((target - current) / monthly);
}

export async function getGoals(): Promise<GoalsSummary> {
  const [goalRows, kidRows, netWorth] = await Promise.all([
    sql<{ id: string; name: string; current_zar: string; target_zar: string | null;
          monthly_zar: string; priority: string | null; status: string | null; target_date: string | null }>`
      select id::text, name, current_zar, target_zar, monthly_zar, priority, status, target_date::text
      from goals where not archived order by current_zar desc`,
    sql<{ id: string; account: string; child: string | null; institution: string | null;
          balance_zar: string; monthly_zar: string }>`
      select id::text, account, child, institution, balance_zar, monthly_zar
      from kids_accounts order by balance_zar desc`,
    getNetWorth(),
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
    institution: r.institution, balanceZar: money(r.balance_zar), monthlyZar: money(r.monthly_zar),
  }));

  return {
    freedom: {
      targetZar: FREEDOM_TARGET_ZAR, label: FREEDOM_TARGET_LABEL,
      currentZar: netWorth.assetsZar,
      progressPct: (netWorth.assetsZar / FREEDOM_TARGET_ZAR) * 100,
    },
    goals, kids,
    totals: {
      savedZar: goals.reduce((t, g) => t + g.currentZar, 0),
      targetZar: goals.reduce((t, g) => t + (g.targetZar ?? 0), 0),
      monthlyZar: goals.reduce((t, g) => t + g.monthlyZar, 0),
      kidsZar: kids.reduce((t, k) => t + k.balanceZar, 0),
    },
  };
}
