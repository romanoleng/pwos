"use client";

import Link from "next/link";
import useSWR from "swr";

import { LoadingCard } from "@/components/ui/LoadingCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EditableAmount } from "@/components/ui/EditableAmount";
import { Money } from "@/components/ui/Money";
import { groupByChild, isKidInvestment } from "@/lib/kids";
import type { GoalsSummary } from "@/lib/server/goals";
import type { NetWorthSummary } from "@/lib/server/networth";

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load investments.");
  return response.json();
}

/** §5 keeps Investments a summary in V1; crypto has its own module. */
const INVESTMENT_CLASSES = ["Investments", "Property", "Savings"];

export function InvestmentsScreen() {
  const { data, error, mutate } = useSWR<NetWorthSummary>("/api/networth", fetcher);
  // Kids' accounts come from the goals payload, which already reads them.
  const { data: goals, mutate: mutateGoals } = useSWR<GoalsSummary>("/api/goals", fetcher);
  if (error) return <Card><CardBody className="text-sm text-loss">Couldn&apos;t load investments.</CardBody></Card>;
  if (!data) return <LoadingCard rows={3} />;

  const refresh = () => {
    void mutate();
    void mutateGoals();
  };
  const kidGroups = groupByChild(
    (goals?.kids ?? []).filter((kid) => isKidInvestment(kid.accountType)),
  );
  const classes = data.classes.filter((c) => INVESTMENT_CLASSES.includes(c.category));
  const total = classes.reduce((sum, c) => sum + c.valueZar, 0);
  const crypto = data.classes.find((c) => c.category === "Crypto");

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Invested outside crypto</p>
          <Money value={total} variant="whole" className="mt-1.5 block text-2xl font-semibold tracking-tight" />
          {crypto ? (
            <p className="mt-2 text-xs text-muted">
              Crypto is tracked live and sits at <Money value={crypto.valueZar} variant="whole" /> —{" "}
              <Link href="/crypto" className="text-accent hover:underline">see the Crypto module</Link>.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {classes.map((entry) => (
        <Card key={entry.category}>
          <CardHeader title={entry.category} action={<Money value={entry.valueZar} variant="whole" className="text-sm" />} />
          <ul className="divide-y divide-line">
            {entry.rows.map((row) => (
              <li key={row.recordId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="truncate text-sm">{row.name}</span>
                <EditableAmount editKey="netWorth.value" recordId={row.recordId} value={row.valueZar} onSaved={refresh} className="text-sm" />
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {kidGroups.map((group) => (
        <Card key={group.child}>
          <CardHeader
            title={`${group.child}'s investments`}
            description="Retirement annuity, tax-free savings and the share account, each tracked on its own."
            action={
              <span className="text-sm">
                <Money value={group.balanceZar} variant="whole" />
                {group.monthlyZar > 0 ? (
                  <span className="ml-2 text-[11px] text-faint">
                    +<Money value={group.monthlyZar} variant="whole" />
                    /mo
                  </span>
                ) : null}
              </span>
            }
          />
          <ul className="divide-y divide-line">
            {group.accounts.map((kid) => (
              <li key={kid.recordId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{kid.account}</p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {kid.institution ?? "—"} · contributing{" "}
                    <EditableAmount
                      editKey="kids.monthly"
                      recordId={kid.recordId}
                      value={kid.monthlyZar}
                      onSaved={refresh}
                      className="text-faint"
                    />
                    /mo
                  </p>
                </div>
                <EditableAmount
                  editKey="kids.balance"
                  recordId={kid.recordId}
                  value={kid.balanceZar}
                  onSaved={refresh}
                  className="text-sm"
                />
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <p className="text-[11px] text-faint">Tap any balance or contribution to update it.</p>
    </div>
  );
}
