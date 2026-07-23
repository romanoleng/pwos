"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { LoadingCard } from "@/components/ui/LoadingCard";
import { Card, CardBody } from "@/components/ui/Card";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { DeleteRecordButton } from "@/components/ui/DeleteRecordButton";
import { EditableAmount } from "@/components/ui/EditableAmount";
import { EditableName } from "@/components/ui/EditableName";
import { Money, Sensitive } from "@/components/ui/Money";
import { RecordEditor } from "@/components/ui/RecordEditor";
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
  const [adding, setAdding] = useState(false);
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Invested outside crypto</p>
              <Money value={total} variant="whole" className="mt-1.5 block text-2xl font-semibold tracking-tight" />
            </div>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium hover:bg-surface-2"
            >
              <Plus size={13} strokeWidth={2} />
              Add
            </button>
          </div>
          {crypto ? (
            <p className="mt-2 text-xs text-muted">
              Crypto is tracked live and sits at <Money value={crypto.valueZar} variant="whole" /> —{" "}
              <Link href="/crypto" className="text-accent hover:underline">see the Crypto module</Link>.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {classes.map((entry) => (
        <CollapsibleSection
          key={entry.category}
          id={`investments:${entry.category}`}
          title={entry.category}
          tone="info"
          action={<Money value={entry.valueZar} variant="whole" className="text-sm" />}
        >
          <ul className="divide-y divide-line">
            {entry.rows.map((row) => (
              <li key={row.recordId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="truncate text-sm"><Sensitive>{row.name}</Sensitive></span>
                <EditableAmount editKey="netWorth.value" recordId={row.recordId} value={row.valueZar} onSaved={refresh} className="text-sm" />
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ))}

      {kidGroups.map((group) => (
        <CollapsibleSection
          key={group.child}
          id={`investments:kids:${group.child}`}
          title={`${group.child}'s investments`}
          description="Retirement annuity, tax-free savings and the share account, each tracked on its own."
          tone="info"
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
        >
          <ul className="divide-y divide-line">
            {group.accounts.map((kid) => (
              <li key={kid.recordId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center text-sm">
                    <EditableName kind="kidAccount" recordId={kid.recordId} value={kid.account} onSaved={refresh} />
                  </p>
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
                <span className="flex shrink-0 items-center gap-1">
                  <EditableAmount
                    editKey="kids.balance"
                    recordId={kid.recordId}
                    value={kid.balanceZar}
                    onSaved={refresh}
                    className="text-sm"
                  />
                  <DeleteRecordButton kind="kidAccount" recordId={kid.recordId} label={kid.account} onDone={refresh} />
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ))}

      <p className="text-[11px] text-faint">Tap a balance to update it, or a name to rename it.</p>

      {adding ? (
        <RecordEditor
          open
          kind="asset"
          onClose={() => setAdding(false)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}
