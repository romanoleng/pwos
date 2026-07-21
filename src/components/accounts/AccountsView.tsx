"use client";

import { AlertTriangle } from "lucide-react";
import useSWR from "swr";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import type { AccountsView as AccountsData } from "@/lib/server/accounts";
import { formatDate } from "@/lib/format";

type ApiError = { error: string; message: string; variable?: string };

async function fetcher(url: string): Promise<AccountsData> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.message ?? "Could not load accounts.");
  }
  return response.json();
}

const KIND_LABEL: Record<string, string> = {
  cash: "Cash",
  savings: "Savings",
  business: "Business",
  crypto: "Crypto",
  unknown: "Other",
};

export function AccountsScreen() {
  const { data, error } = useSWR<AccountsData>("/api/accounts", fetcher, {
    refreshInterval: 120_000,
  });

  if (error) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-loss">Couldn&apos;t load accounts</p>
          <p className="mt-1.5 text-xs text-muted">{error.message}</p>
        </CardBody>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody>
      </Card>
    );
  }

  const { accounts, totals, unmappedAccounts, missingBalances } = data;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Safe to spend
          </p>
          <Money
            value={totals.spendableZar}
            variant="whole"
            className="mt-1.5 block text-3xl font-semibold tracking-tight"
          />
          <p className="mt-1 text-xs text-muted">
            Capitec Main + GOtyme only. Business and savings excluded.
          </p>

          <dl className="mt-5 grid grid-cols-3 gap-4">
            <Stat label="All cash">
              <Money value={totals.cashZar} variant="whole" />
            </Stat>
            <Stat label="Savings">
              <Money value={totals.savingsZar} variant="whole" />
            </Stat>
            <Stat label="Business">
              <Money value={totals.businessZar} variant="whole" />
            </Stat>
          </dl>
        </CardBody>
      </Card>

      {missingBalances.length > 0 || unmappedAccounts.length > 0 ? (
        <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-warn">
            <AlertTriangle size={13} strokeWidth={2} />
            Needs your attention
          </p>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
            {missingBalances.map((label) => (
              <li key={label}>
                <span className="text-ink">{label}</span>{" "}has transactions but no
                balance recorded in Net Worth, so it&apos;s excluded from every total
                above rather than counted as zero.
              </li>
            ))}
            {unmappedAccounts.map((entry) => (
              <li key={entry.name}>
                <span className="text-ink">{entry.name}</span> ({entry.count}{" "}
                {entry.count === 1 ? "transaction" : "transactions"}) doesn&apos;t match
                any known account — tell me what it is and I&apos;ll map it.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Accounts"
          description="Balance as recorded, with ledger activity as a cross-check."
        />
        <ul className="divide-y divide-line">
          {accounts.map((entry) => (
            <li key={entry.account.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {entry.account.label}
                  <span className="rounded bg-raise px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">
                    {KIND_LABEL[entry.account.kind]}
                  </span>
                  {entry.account.spendable ? (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent">
                      Spendable
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[11px] text-faint">
                  {entry.transactionCount > 0 ? (
                    <>
                      {entry.transactionCount}{" "}
                      {entry.transactionCount === 1 ? "transaction" : "transactions"}
                      {entry.lastActivity
                        ? ` · last ${formatDate(entry.lastActivity)}`
                        : ""}
                    </>
                  ) : (
                    "No transactions logged"
                  )}
                </p>
              </div>

              <div className="text-right">
                {entry.storedZar === null ? (
                  <span className="text-sm text-warn">Not recorded</span>
                ) : (
                  <Money value={entry.storedZar} variant="whole" className="text-sm" />
                )}
                {entry.transactionCount > 0 ? (
                  <p className="text-[11px] text-faint">
                    ledger <Money value={entry.transactionNetZar} variant="whole" signed />
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-[11px] leading-relaxed text-faint">
        Balances are the figures recorded in your Net Worth table. The ledger column
        is the net of transactions logged in PWOS — a cross-check, not a balance,
        because the ledger doesn&apos;t reach back to when each account was opened.
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
