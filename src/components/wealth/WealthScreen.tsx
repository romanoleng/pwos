"use client";

import useSWR from "swr";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { formatPercent } from "@/lib/format";
import type { NetWorthSummary } from "@/lib/server/networth";
import type { DebtSummary } from "@/lib/debt";

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load.");
  return response.json();
}

export function WealthScreen() {
  const { data: nw, error } = useSWR<NetWorthSummary>("/api/networth", json);
  const { data: debt } = useSWR<DebtSummary>("/api/debt", json);

  if (error) return <Card><CardBody className="text-sm text-loss">Couldn&apos;t load wealth.</CardBody></Card>;
  if (!nw) return <Card><CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody></Card>;

  const maxClass = Math.max(...nw.classes.map((c) => c.valueZar), 1);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] text-faint">Assets</p>
              <Money value={nw.assetsZar} variant="whole" className="text-sm" />
            </div>
            <div>
              <p className="text-[11px] text-faint">Liabilities</p>
              <Money value={nw.liabilitiesZar} variant="whole" className="text-sm text-loss" />
            </div>
            <div>
              <p className="text-[11px] text-faint">Net</p>
              <Money value={nw.netZar} variant="whole" className={`text-sm ${nw.netZar < 0 ? "text-loss" : ""}`} />
            </div>
          </div>

          {/* Assets vs liabilities at a glance — the bar that matters most. */}
          <div className="mt-5 space-y-2">
            <Bar label="Assets" value={nw.assetsZar} max={Math.max(nw.assetsZar, nw.liabilitiesZar)} tone="bg-accent" />
            <Bar label="Liabilities" value={nw.liabilitiesZar} max={Math.max(nw.assetsZar, nw.liabilitiesZar)} tone="bg-loss" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Wealth by class" description="Crypto live; everything else as recorded." />
        <ul className="divide-y divide-line">
          {nw.classes.map((entry) => (
            <li key={entry.category} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm">{entry.category}</p>
                <p className="text-sm">
                  <Money value={entry.valueZar} variant="whole" />
                  <span className="ml-2 text-[11px] text-faint">
                    {formatPercent(nw.assetsZar > 0 ? (entry.valueZar / nw.assetsZar) * 100 : 0)}
                  </span>
                </p>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-raise">
                <div className="h-full rounded-full bg-accent/70" style={{ width: `${(entry.valueZar / maxClass) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {debt && debt.duplicates.length > 0 ? (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
          Liabilities include <Money value={nw.duplicateOvercountZar} variant="whole" /> of
          possibly duplicated debt. Resolved, net worth would be{" "}
          <Money value={nw.dedupedNetZar} variant="whole" />. See the Debt screen.
        </p>
      ) : null}
    </div>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-faint">
        <span>{label}</span>
        <Money value={value} variant="whole" />
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-raise">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
