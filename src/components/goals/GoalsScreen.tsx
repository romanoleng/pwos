"use client";

import useSWR from "swr";

import { LoadingCard } from "@/components/ui/LoadingCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DeleteRecordButton } from "@/components/ui/DeleteRecordButton";
import { EditableAmount } from "@/components/ui/EditableAmount";
import { EditableName } from "@/components/ui/EditableName";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Money } from "@/components/ui/Money";
import { formatDate, formatPercent } from "@/lib/format";
import { isKidInvestment } from "@/lib/kids";
import type { GoalsSummary } from "@/lib/server/goals";
import type { HomeSummary } from "@/lib/server/home";

async function fetcher(url: string): Promise<GoalsSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load goals.");
  return response.json();
}

export function GoalsScreen() {
  const { data, error, mutate } = useSWR<GoalsSummary>("/api/goals", fetcher);
  // Same key Home uses, so this costs nothing extra — savings-type accounts
  // belong on the savings screen, not only buried in the accounts list.
  const { data: home, mutate: mutateHome } = useSWR<HomeSummary>(
    "/api/home?period=cycle",
    (url: string) => fetch(url).then((r) => r.json()),
  );
  if (error) return <Card><CardBody className="text-sm text-loss">Couldn&apos;t load goals.</CardBody></Card>;
  if (!data) return <LoadingCard rows={3} />;

  const refresh = () => {
    void mutate();
    void mutateHome();
  };
  const savingsBanks = (home?.cards ?? []).filter((card) => card.kind === "savings");
  // Their investments are tracked individually on the Investments screen, so
  // only reachable cash is listed here.
  const savingsAccounts = data.kids.filter((kid) => !isKidInvestment(kid.accountType));

  return (
    <div className="space-y-4">
      {/* The crypto freedom card lived here; removed 2026-07-24 (Romano's ask)
          — it's the crypto module's long-term target, not savings, and this
          screen is about the pots. It still leads the Crypto tab. */}
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
                  <p className="flex min-w-0 items-center text-sm font-medium">
                    <EditableName kind="goal" recordId={goal.recordId} value={goal.name} onSaved={refresh} />
                    {goal.status ? <span className="ml-2 shrink-0 rounded bg-raise px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">{goal.status}</span> : null}
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
                  <span className="flex items-center gap-2">
                    {goal.monthsToTarget !== null
                      ? `${goal.monthsToTarget} ${goal.monthsToTarget === 1 ? "month" : "months"} at this rate`
                      : goal.monthlyZar <= 0 && goal.targetZar
                        ? "no contribution set"
                        : ""}
                    <DeleteRecordButton kind="goal" recordId={goal.recordId} label={goal.name} onDone={refresh} />
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {savingsBanks.length > 0 ? (
        <CollapsibleSection
          id="savings:accounts"
          title="Savings accounts"
          description="Your savings pots and their balances."
          action={
            <Money
              value={savingsBanks.reduce((t, c) => t + (c.balanceZar ?? 0), 0)}
              variant="whole"
              className="text-sm"
            />
          }
        >
          <ul className="divide-y divide-line">
            {savingsBanks.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <p className="flex min-w-0 items-center gap-1 text-sm font-medium">
                  <EditableName kind="account" recordId={card.id} value={card.label} onSaved={refresh} />
                </p>
                <span className="flex shrink-0 items-center gap-1">
                  {card.balanceZar === null ? (
                    <span className="text-[11px] text-warn">Not recorded</span>
                  ) : (
                    <EditableAmount
                      editKey="netWorth.value"
                      recordId={card.id}
                      value={card.balanceZar}
                      onSaved={refresh}
                      className="text-sm"
                    />
                  )}
                  <DeleteRecordButton kind="account" recordId={card.id} label={card.label} onDone={refresh} />
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

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
                  <p className="flex min-w-0 items-center text-sm font-medium">
                    <EditableName kind="kidAccount" recordId={kid.recordId} value={kid.account} onSaved={refresh} />
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {[kid.child, kid.institution].filter(Boolean).join(" · ") || "—"}
                    {kid.monthlyZar > 0 ? (
                      <>
                        {" · "}
                        <Money value={kid.monthlyZar} variant="whole" className="text-faint" />
                        /mo
                      </>
                    ) : null}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <EditableAmount editKey="kids.balance" recordId={kid.recordId} value={kid.balanceZar} onSaved={refresh} className="text-sm" />
                  <DeleteRecordButton kind="kidAccount" recordId={kid.recordId} label={kid.account} onDone={refresh} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <p className="text-[11px] leading-relaxed text-faint">
        Tap any figure to edit it, or a name to rename it — a good way to note
        where a pot sits, e.g. &ldquo;GOtyme · Big Emergency&rdquo;. The trash
        icon archives (never deletes); everything can be undone.
      </p>
    </div>
  );
}
