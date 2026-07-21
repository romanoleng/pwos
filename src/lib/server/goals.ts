/**
 * Goals (CLAUDE.md §5) — the freedom goal, savings goals and kids' accounts.
 */
import "server-only";

import { FREEDOM_TARGET_ZAR, FREEDOM_TARGET_LABEL } from "@/lib/constants";
import { TABLES } from "@/lib/airtable-fields";

import { listRecords, numberCell, stringCell } from "./airtable";
import { getNetWorth } from "./networth";

export type Goal = {
  recordId: string;
  name: string;
  currentZar: number;
  targetZar: number | null;
  monthlyZar: number;
  progressPct: number | null;
  status: string | null;
  priority: string | null;
  targetDate: string | null;
  /** Months to target at the current contribution rate. */
  monthsToTarget: number | null;
};

export type KidAccount = {
  recordId: string;
  account: string;
  child: string | null;
  institution: string | null;
  balanceZar: number;
  monthlyZar: number;
};

export type GoalsSummary = {
  freedom: { targetZar: number; label: string; currentZar: number; progressPct: number };
  goals: Goal[];
  kids: KidAccount[];
  totals: { savedZar: number; targetZar: number; monthlyZar: number; kidsZar: number };
};

function monthsToTarget(current: number, target: number | null, monthly: number) {
  if (!target || monthly <= 0 || current >= target) return null;
  return Math.ceil((target - current) / monthly);
}

export async function getGoals(): Promise<GoalsSummary> {
  const [goalRecords, kidRecords, netWorth] = await Promise.all([
    listRecords(TABLES.savingsGoals),
    listRecords(TABLES.kidsAccounts),
    getNetWorth(),
  ]);

  const goals: Goal[] = goalRecords.map((record) => {
    const currentZar = numberCell(record, "fldSmsn73477TEYE0") ?? 0;
    const targetZar = numberCell(record, "fldcDGPSwZKG4ALbJ");
    const monthlyZar = numberCell(record, "fld64sfkThfhk7isF") ?? 0;
    return {
      recordId: record.id,
      name: stringCell(record, "fldCDKjnCjOW6sUu1") ?? "—",
      currentZar,
      targetZar,
      monthlyZar,
      progressPct: targetZar && targetZar > 0 ? (currentZar / targetZar) * 100 : null,
      status: stringCell(record, "flda0qgDfdFeY7O04"),
      priority: stringCell(record, "fldiHd4MmHDsHOWyU"),
      targetDate: stringCell(record, "fldjQC4N5wCQludnZ"),
      monthsToTarget: monthsToTarget(currentZar, targetZar, monthlyZar),
    };
  });

  const kids: KidAccount[] = kidRecords.map((record) => ({
    recordId: record.id,
    account: stringCell(record, "fldYSUjwg09Rejvkc") ?? "—",
    child: stringCell(record, "fldRe1SuyyfoDl3J7"),
    institution: stringCell(record, "fldb7f793z9kWEehF"),
    balanceZar: numberCell(record, "fldP70Dc7YXA3A0KB") ?? 0,
    monthlyZar: numberCell(record, "fldbKtVU7GGxGsLbX") ?? 0,
  }));

  return {
    freedom: {
      targetZar: FREEDOM_TARGET_ZAR,
      label: FREEDOM_TARGET_LABEL,
      currentZar: netWorth.assetsZar,
      progressPct: (netWorth.assetsZar / FREEDOM_TARGET_ZAR) * 100,
    },
    goals: goals.sort((a, b) => b.currentZar - a.currentZar),
    kids: kids.sort((a, b) => b.balanceZar - a.balanceZar),
    totals: {
      savedZar: goals.reduce((t, g) => t + g.currentZar, 0),
      targetZar: goals.reduce((t, g) => t + (g.targetZar ?? 0), 0),
      monthlyZar: goals.reduce((t, g) => t + g.monthlyZar, 0),
      kidsZar: kids.reduce((t, k) => t + k.balanceZar, 0),
    },
  };
}
