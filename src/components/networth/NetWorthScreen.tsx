"use client";

import useSWR from "swr";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EditableAmount } from "@/components/ui/EditableAmount";
import { Money } from "@/components/ui/Money";
import type { NetWorthSummary } from "@/lib/server/networth";
import { formatPercent } from "@/lib/format";

async function fetcher(url: string): Promise<NetWorthSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load net worth.");
  return response.json();
}

export function NetWorthScreen() {
  const { data, error, mutate } = useSWR<NetWorthSummary>("/api/networth", fetcher);

  if (error) {
    return <Card><CardBody className="text-sm text-loss">Couldn&apos;t load net worth.</CardBody></Card>;
  }
  if (!data) {
    return <Card><CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody></Card>;
  }

  const refresh = () => void mutate();
  const cryptoDrift = data.liveCryptoZar - data.storedCryptoZar;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Net worth
          </p>
          <Money
            value={data.netZar}
            variant="whole"
            className={`mt-1.5 block text-3xl font-semibold tracking-tight md:text-4xl ${
              data.netZar < 0 ? "text-loss" : ""
            }`}
          />
          <p className="mt-1.5 text-xs text-muted">
            Assets <Money value={data.assetsZar} variant="whole" /> minus liabilities{" "}
            <Money value={data.liabilitiesZar} variant="whole" />. Computed live, not
            hand-maintained.
          </p>

          {data.duplicateOvercountZar > 0 ? (
            <p className="mt-4 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
              If the flagged duplicate debts are one obligation, liabilities are{" "}
              <Money value={data.dedupedLiabilitiesZar} variant="whole" /> and net worth
              is <Money value={data.dedupedNetZar} variant="whole" /> — a difference of{" "}
              <Money value={data.duplicateOvercountZar} variant="whole" />. Resolve it on
              the Debt screen.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Assets by class"
          description="Crypto is live. Everything else is the figure you've recorded — tap to edit."
        />
        <ul className="divide-y divide-line">
          {data.classes.map((entry) => (
            <li key={entry.category} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">
                  {entry.category}
                  {entry.live ? (
                    <span className="ml-2 rounded bg-gain/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gain">
                      Live
                    </span>
                  ) : null}
                </p>
                <div className="text-right text-sm">
                  <Money value={entry.valueZar} variant="whole" />
                  <p className="text-[11px] text-faint">
                    {formatPercent(
                      data.assetsZar > 0 ? (entry.valueZar / data.assetsZar) * 100 : 0,
                    )}
                  </p>
                </div>
              </div>
              {entry.rows.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {entry.rows.map((row) => (
                    <li key={row.recordId} className="flex justify-between gap-3 text-[11px]">
                      <span className="text-muted">{row.name}</span>
                      <EditableAmount
                        editKey="netWorth.value"
                        recordId={row.recordId}
                        value={row.valueZar}
                        onSaved={refresh}
                        className="text-muted"
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {data.liabilities.length > 0 ? (
        <Card>
          <CardHeader
            title="Liabilities"
            description="What you owe — the home loan and every tracked debt, on one page."
          />
          <ul className="divide-y divide-line">
            {data.liabilities.map((row) => (
              <li key={row.recordId} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="truncate text-sm">{row.name}</span>
                <Money value={-row.balanceZar} variant="whole" className="text-sm text-loss" />
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 border-t border-line px-4 py-3">
              <span className="text-sm font-medium">Total owed</span>
              <Money value={-data.liabilitiesZar} variant="whole" className="text-sm font-medium text-loss" />
            </li>
          </ul>
        </Card>
      ) : null}

      {Math.abs(cryptoDrift) > 100 ? (
        <p className="text-[11px] leading-relaxed text-faint">
          Your Net Worth table records crypto at{" "}
          <Money value={data.storedCryptoZar} variant="whole" />, but live it is{" "}
          <Money value={data.liveCryptoZar} variant="whole" /> — a drift of{" "}
          <Money value={Math.abs(cryptoDrift)} variant="whole" />. The live figure is
          used here, which is why net worth is derived rather than stored.
        </p>
      ) : null}
    </div>
  );
}
