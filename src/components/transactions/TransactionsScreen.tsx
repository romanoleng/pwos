"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { LogTransaction } from "@/components/transactions/LogTransaction";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { formatDate } from "@/lib/format";
import type { TransactionRow } from "@/lib/server/transactions";
import type { TransactionType } from "@/lib/transactions";

async function fetcher(url: string): Promise<{ transactions: TransactionRow[] }> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Could not load transactions.");
  }
  return response.json();
}

const TYPE_TONE: Record<TransactionType, string> = {
  expense: "text-muted",
  income: "text-gain",
  transfer: "text-info",
  contribution: "text-accent",
};

const TYPES: TransactionType[] = ["expense", "income", "transfer", "contribution"];

export function TransactionsScreen() {
  const { data, error, mutate } = useSWR("/api/transactions", fetcher);
  const [logging, setLogging] = useState(false);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<TransactionType[]>([]);

  const all = useMemo(() => data?.transactions ?? [], [data]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((row) => {
      if (types.length > 0 && !types.includes(row.type)) return false;
      if (!needle) return true;
      return `${row.description} ${row.category ?? ""} ${row.accountLabel ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [all, query, types]);

  // Negate rather than Math.abs: a refund sits in a spending category with a
  // positive amount ("Reversal - Purchase at Pick n Pay", +R508), and must
  // reduce spend rather than add to it.
  const spend = visible
    .filter((row) => row.type === "expense")
    .reduce((total, row) => total - row.amountZar, 0);
  const income = visible
    .filter((row) => row.type === "income")
    .reduce((total, row) => total + row.amountZar, 0);
  const lowConfidence = all.filter((row) => row.typeConfidence === "low").length;

  if (error) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-loss">Couldn&apos;t load transactions</p>
          <p className="mt-1.5 text-xs text-muted">{error.message}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transactions…"
            aria-label="Search transactions"
            className="h-10 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-3 text-sm outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={15} strokeWidth={2} />
          Log
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={types.includes(type)}
            onClick={() =>
              setTypes((current) =>
                current.includes(type)
                  ? current.filter((t) => t !== type)
                  : [...current, type],
              )
            }
            className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors ${
              types.includes(type)
                ? "border-accent/50 bg-accent/15 text-ink"
                : "border-line text-muted hover:border-line-2 hover:text-ink"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface px-4 py-3">
        <div>
          <p className="text-[11px] text-faint">Spend shown</p>
          <Money value={spend} variant="whole" className="text-sm" />
        </div>
        <div>
          <p className="text-[11px] text-faint">Income shown</p>
          <Money value={income} variant="whole" className="text-sm" />
        </div>
      </div>

      {lowConfidence > 0 ? (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
          {lowConfidence} {lowConfidence === 1 ? "entry has" : "entries have"}{" "}
          a guessed type — Airtable has no Type field yet, so it&apos;s inferred from
          category and amount. Add the field and these become certain.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Ledger"
          description={`${visible.length} of ${all.length} entries`}
        />
        {!data ? (
          <CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody>
        ) : visible.length === 0 ? (
          <CardBody className="py-10 text-center text-sm text-muted">
            Nothing matches that.
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {visible.slice(0, 200).map((row) => (
              <li key={row.recordId} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{row.description}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                    <span>{row.date ? formatDate(row.date) : "no date"}</span>
                    <span>·</span>
                    <span>{row.accountLabel ?? "unassigned"}</span>
                    {row.category ? (
                      <>
                        <span>·</span>
                        <span>{row.category}</span>
                      </>
                    ) : null}
                    <span
                      className={`capitalize ${TYPE_TONE[row.type]}`}
                      title={row.typeReason}
                    >
                      {row.type}
                      {row.typeConfidence === "low" ? "?" : ""}
                    </span>
                  </p>
                </div>
                <Money
                  value={row.amountZar}
                  className="shrink-0 text-sm"
                  tone={row.amountZar < 0 ? "flat" : "gain"}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {visible.length > 200 ? (
        <p className="text-center text-[11px] text-faint">
          Showing the 200 most recent of {visible.length}. Narrow the search to see more.
        </p>
      ) : null}

      <LogTransaction
        open={logging}
        onClose={() => setLogging(false)}
        onSaved={() => void mutate()}
      />
    </div>
  );
}
