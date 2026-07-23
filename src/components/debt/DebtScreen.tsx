"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { LoadingCard } from "@/components/ui/LoadingCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EditableAmount } from "@/components/ui/EditableAmount";
import { Money } from "@/components/ui/Money";
import { payoffOrder, type DebtSummary } from "@/lib/debt";
import { formatDate, formatPercent } from "@/lib/format";

async function fetcher(url: string): Promise<DebtSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load debts.");
  return response.json();
}

export function DebtScreen() {
  const { data, error, mutate } = useSWR<DebtSummary>("/api/debt", fetcher);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (error) {
    return (
      <Card>
        <CardBody className="text-sm text-loss">Couldn&apos;t load debts.</CardBody>
      </Card>
    );
  }
  if (!data) {
    return (
      <LoadingCard rows={3} />
    );
  }

  const refresh = () => void mutate();
  const ordered = payoffOrder(data.rows);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Total owed
          </p>
          <Money
            value={data.totalZar}
            variant="whole"
            className="mt-1.5 block text-3xl font-semibold tracking-tight"
          />
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Monthly commitment">
              <Money value={data.monthlyZar} variant="whole" />
            </Stat>
            <Stat label="If duplicates merged">
              <Money value={data.dedupedTotalZar} variant="whole" />
            </Stat>
            <Stat label="Of which estimated">
              <Money value={data.estimatedZar} variant="whole" />
            </Stat>
          </dl>
          {data.estimatedZar > 0 ? (
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
              <Money value={data.estimatedZar} variant="whole" /> of this total is
              an estimate, not a statement figure. Confirm those balances and the
              number below gets real.
            </p>
          ) : null}
          {Math.abs(data.discrepancyZar) > 1 ? (
            <p className="mt-4 border-t border-line pt-3 text-xs text-warn">
              Debt Tracker and the Net Worth table disagree by{" "}
              <Money value={Math.abs(data.discrepancyZar)} variant="whole" />. Debt
              Tracker is the source of truth, so that is what the app uses.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {data.duplicates.map((group) => (
        <div
          key={group.rows.map((r) => r.recordId).join("-")}
          className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3"
        >
          <p className="flex items-center gap-1.5 text-xs font-medium text-warn">
            <AlertTriangle size={13} strokeWidth={2} />
            Possible duplicate — counted{" "}
            <Money value={group.countedZar} variant="whole" />, likely{" "}
            <Money value={group.dedupedZar} variant="whole" />
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{group.reason}</p>
          <ul className="mt-2 space-y-1">
            {group.rows.map((row) => (
              <li key={row.recordId} className="flex justify-between gap-3 text-[11px]">
                <span className="text-ink">{row.name}</span>
                <Money value={row.balanceZar} variant="whole" className="text-muted" />
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] text-faint">
            Nothing is merged or deleted automatically. Confirm which is real, then
            correct the balances below.
          </p>
        </div>
      ))}

      <Card>
        <CardHeader
          title="Payoff order"
          description="Highest interest first; ties broken by smallest balance."
        />
        <ul className="divide-y divide-line">
          {ordered.map((row) => {
            const open = expanded === row.recordId;
            return (
            <li key={row.recordId}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : row.recordId)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-faint">
                  {row.balanceEstimated ? (
                    <span className="text-warn">estimate</span>
                  ) : null}
                  {row.status ? <span>{row.balanceEstimated ? "· " : ""}{row.status}</span> : null}
                  {row.interestPct ? <span>· {formatPercent(row.interestPct)}</span> : null}
                  {row.payoffDate ? <span>· target {formatDate(row.payoffDate)}</span> : null}
                </p>
              </div>
              <div className="text-right text-sm">
                {row.balanceEstimated ? (
                  <span className="mr-0.5 text-faint" aria-label="approximately">
                    ~
                  </span>
                ) : null}
                <Money value={row.balanceZar} variant="whole" />
                <p className="text-[11px] text-faint">
                  <Money value={row.monthlyZar} variant="whole" /> /mo
                </p>
              </div>
              <ChevronDown
                size={14}
                strokeWidth={1.75}
                className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>

            {open ? (
              <div className="space-y-2.5 border-t border-line bg-bg/40 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-faint">Outstanding balance</span>
                  <EditableAmount
                    editKey="debt.balance"
                    recordId={row.recordId}
                    value={row.balanceZar}
                    onSaved={refresh}
                    className="text-sm"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-faint">Monthly payment</span>
                  <EditableAmount
                    editKey="debt.monthly"
                    recordId={row.recordId}
                    value={row.monthlyZar}
                    onSaved={refresh}
                    className="text-sm"
                  />
                </div>
              </div>
            ) : null}
            </li>
            );
          })}
        </ul>
      </Card>

      <p className="text-[11px] text-faint">
        Tap any balance or monthly figure to edit it. Changes save immediately and can
        be undone.
      </p>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
