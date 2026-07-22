"use client";

import useSWR from "swr";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EditableAmount } from "@/components/ui/EditableAmount";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Money } from "@/components/ui/Money";
import { formatDate, formatMoneyWhole, formatPercent } from "@/lib/format";
import { isKidInvestment } from "@/lib/kids";
import type { GoalsSummary } from "@/lib/server/goals";

async function fetcher(url: string): Promise<GoalsSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load goals.");
  return response.json();
}

export function GoalsScreen() {
  const { data, error, mutate } = useSWR<GoalsSummary>("/api/goals", fetcher);
  if (error) return <Card><CardBody className="text-sm text-loss">Couldn&apos;t load goals.</CardBody></Card>;
  if (!data) return <Card><CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody></Card>;

  const refresh = () => void mutate();
  // Their investments are tracked individually on the Investments screen, so
  // only reachable cash is listed here.
  const savingsAccounts = data.kids.filter((kid) => !isKidInvestment(kid.accountType));

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Freedom · {data.freedom.label}
          </p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
            <Money value={data.freedom.currentZar} variant="whole" className="text-2xl font-semibold tracking-tight" />
            <span className="text-sm text-muted">of <Money value={data.freedom.targetZar} variant="compact" /></span>
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-raise">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, data.freedom.progressPct)}%` }} />
          </div>
          <p className="mt-2 text-xs text-faint">{formatPercent(data.freedom.progressPct)}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Savings goals"
          description={`${data.goals.length} goals · ${formatPercent(data.totals.targetZar > 0 ? (data.totals.savedZar / data.totals.targetZar) * 100 : 0)} of targets`}
          action={<div className="text-right text-sm"><Money value={data.totals.savedZar} variant="whole" /><p className="text-[11px] text-faint"><Money value={data.totals.monthlyZar} variant="whole" />/mo</p></div>}
        />
        {data.goals.length === 0 ? (
          <CardBody className="py-8 text-center text-xs text-muted">No savings goals yet.</CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {data.goals.map((goal) => (
              <li key={goal.recordId} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{goal.name}
                    {goal.status ? <span className="ml-2 rounded bg-raise px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">{goal.status}</span> : null}
                  </p>
                  <p className="shrink-0 text-sm">
                    <EditableAmount editKey="goal.balance" recordId={goal.recordId} value={goal.currentZar} onSaved={refresh} />
                    <span className="text-faint"> / </span>
                    <EditableAmount editKey="goal.target" recordId={goal.recordId} value={goal.targetZar} onSaved={refresh} className="text-muted" />
                  </p>
                </div>
                {goal.progressPct !== null ? (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raise">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, goal.progressPct))}%` }} />
                  </div>
                ) : null}
                <p className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] text-faint">
                  <span>
                    <EditableAmount editKey="goal.monthly" recordId={goal.recordId} value={goal.monthlyZar} onSaved={refresh} className="text-faint" />
                    {" /mo"}
                    {goal.targetDate ? ` · target ${formatDate(goal.targetDate)}` : ""}
                  </span>
                  <span>
                    {goal.monthsToTarget !== null
                      ? `${goal.monthsToTarget} ${goal.monthsToTarget === 1 ? "month" : "months"} at this rate`
                      : goal.monthlyZar <= 0 && goal.targetZar
                        ? "no contribution set"
                        : ""}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CollapsibleSection
        id="goals:kids"
        title="Lisa & Liam"
        description="Cash they can reach. Their investments live on the Investments screen."
        action={
          <span className="text-sm">
            <Money value={data.totals.kidsSavedZar} variant="whole" />
          </span>
        }
      >
        {savingsAccounts.length === 0 ? (
          <CardBody className="py-8 text-center text-xs text-muted">No accounts recorded.</CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {savingsAccounts.map((kid) => (
              <li key={kid.recordId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{kid.account}</p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {[kid.child, kid.institution].filter(Boolean).join(" · ") || "—"}
                    {kid.monthlyZar > 0 ? ` · ${formatMoneyWhole(kid.monthlyZar)}/mo` : ""}
                  </p>
                </div>
                <EditableAmount editKey="kids.balance" recordId={kid.recordId} value={kid.balanceZar} onSaved={refresh} className="text-sm" />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <p className="text-[11px] text-faint">Tap any figure to edit it. Changes save immediately and can be undone.</p>
    </div>
  );
}
