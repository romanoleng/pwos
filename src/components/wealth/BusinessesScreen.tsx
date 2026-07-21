"use client";

import useSWR from "swr";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { formatDate } from "@/lib/format";
import type { AccountsView } from "@/lib/server/accounts";
import type { ReportsSummary } from "@/lib/server/reports";

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load.");
  return response.json();
}

/**
 * CreativeDigital, basic profile in V1 (§4).
 *
 * Business figures are drawn from the accounts tagged to the business entity
 * and from business-income transactions — never mixed into personal
 * safe-to-spend, which §5 requires stays personal-only.
 */
export function BusinessesScreen() {
  const { data: accounts, error } = useSWR<AccountsView>("/api/accounts", json);
  const { data: reports } = useSWR<ReportsSummary>("/api/reports", json);

  if (error) return <Card><CardBody className="text-sm text-loss">Couldn&apos;t load business data.</CardBody></Card>;
  if (!accounts) return <Card><CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody></Card>;

  const business = accounts.accounts.filter((a) => a.account.entity === "business");
  const total = business.reduce((sum, a) => sum + (a.storedZar ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-sm font-medium">CreativeDigital</p>
          <p className="mt-0.5 text-xs text-muted">Business accounts, held separately from personal money.</p>
          <Money value={total} variant="whole" className="mt-3 block text-2xl font-semibold tracking-tight" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Business accounts" description="Excluded from personal safe-to-spend (§5)." />
        <ul className="divide-y divide-line">
          {business.map((entry) => (
            <li key={entry.account.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.account.label}</p>
                <p className="mt-0.5 text-[11px] text-faint">
                  {entry.transactionCount > 0
                    ? `${entry.transactionCount} entries${entry.lastActivity ? ` · last ${formatDate(entry.lastActivity)}` : ""}`
                    : "No transactions logged"}
                </p>
              </div>
              {entry.storedZar === null ? (
                <span className="text-sm text-warn">Not recorded</span>
              ) : (
                <Money value={entry.storedZar} variant="whole" className="text-sm" />
              )}
            </li>
          ))}
        </ul>
      </Card>

      {reports ? (
        <Card>
          <CardHeader title="Recent months" description="Business income appears in the ledger as Business Income." />
          <ul className="divide-y divide-line">
            {reports.months.slice(0, 4).map((month) => (
              <li key={month.month} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-muted">{month.month}</span>
                <Money value={month.incomeZar} variant="whole" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-[11px] leading-relaxed text-faint">
        V1 keeps this a basic profile (§4). Per-entity income and expense splits are a
        V1.1 candidate.
      </p>
    </div>
  );
}
