"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { LogTransaction } from "@/components/transactions/LogTransaction";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { formatDate, formatPercent } from "@/lib/format";
import type { HomeSummary } from "@/lib/server/home";

async function fetcher(url: string): Promise<HomeSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load your dashboard.");
  return response.json();
}

/**
 * Home is the daily driver: what's available, the cards, the budget, and one
 * tap to log what you just spent. Wealth, crypto and goals live elsewhere.
 *
 * Ordered for a phone in a shop — the number that answers "can I buy this?"
 * is first, and the log button is reachable without scrolling.
 */
export function HomeScreen() {
  const { data, error, mutate } = useSWR<HomeSummary>("/api/home", fetcher, {
    refreshInterval: 120_000,
  });
  const [logging, setLogging] = useState(false);

  if (error) {
    return (
      <Card>
        <CardBody className="text-sm text-loss">
          Couldn&apos;t load your dashboard.
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

  const { available, cards, budget, today, recent, defaults } = data;
  const usedPct =
    budget.budgetedZar > 0 ? (budget.spentZar / budget.budgetedZar) * 100 : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Available to spend
              </p>
              <Money
                value={available.spendableZar}
                variant="whole"
                className="mt-1.5 block text-4xl font-semibold tracking-tight"
              />
              <p className="mt-1 text-xs text-muted">
                Capitec Main + GOtyme ·{" "}
                <Money value={available.totalCashZar} variant="whole" /> cash in total
              </p>
            </div>

            <button
              type="button"
              onClick={() => setLogging(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus size={16} strokeWidth={2.25} />
              Log
            </button>
          </div>

          {today.count > 0 ? (
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
              Today: <Money value={today.spendZar} variant="whole" className="text-ink" />{" "}
              across {today.count} {today.count === 1 ? "entry" : "entries"}
            </p>
          ) : (
            <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
              Nothing logged today.
            </p>
          )}
        </CardBody>
      </Card>

      <Link href="/budgets" className="block">
        <Card className="transition-colors hover:border-line-2">
          <CardBody>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                {budget.overspent ? "Over budget" : "Budget left"}
              </p>
              <p className="text-[11px] text-faint">
                {budget.daysLeft} {budget.daysLeft === 1 ? "day" : "days"} left
              </p>
            </div>

            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
              <Money
                value={Math.abs(budget.remainingZar)}
                variant="whole"
                className={`text-2xl font-semibold tracking-tight ${
                  budget.overspent ? "text-loss" : ""
                }`}
              />
              {budget.dailyAllowanceZar !== null ? (
                <span className="text-xs text-muted">
                  <Money value={budget.dailyAllowanceZar} variant="whole" /> a day
                </span>
              ) : null}
            </p>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-raise">
              <div
                className={`h-full rounded-full ${budget.overspent ? "bg-loss" : "bg-accent"}`}
                style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-faint">
              <Money value={budget.spentZar} variant="whole" /> of{" "}
              <Money value={budget.budgetedZar} variant="whole" /> ·{" "}
              {formatPercent(usedPct, 0)}
            </p>
          </CardBody>
        </Card>
      </Link>

      <Card>
        <CardHeader
          title="Your cards"
          action={
            <Link href="/accounts" className="text-[11px] text-accent hover:underline">
              All accounts
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {cards.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm">
                  {card.label}
                  {card.spendable ? (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent">
                      Spendable
                    </span>
                  ) : null}
                </p>
                {card.lastActivity ? (
                  <p className="mt-0.5 text-[11px] text-faint">
                    last used {formatDate(card.lastActivity)}
                  </p>
                ) : null}
              </div>
              {card.balanceZar === null ? (
                <span className="shrink-0 text-xs text-warn">Not recorded</span>
              ) : (
                <Money
                  value={card.balanceZar}
                  variant="whole"
                  className="shrink-0 text-sm"
                />
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Recent"
          action={
            <Link href="/transactions" className="text-[11px] text-accent hover:underline">
              All transactions
            </Link>
          }
        />
        {recent.length === 0 ? (
          <CardBody className="py-8 text-center text-xs text-muted">
            Nothing logged yet.
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((row) => (
              <li key={row.recordId} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{row.description}</p>
                  <p className="mt-0.5 truncate text-[11px] text-faint">
                    {row.date ? formatDate(row.date) : "—"}
                    {row.accountLabel ? ` · ${row.accountLabel}` : ""}
                    {row.category ? ` · ${row.category}` : ""}
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

      <Link
        href="/wealth"
        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition-colors hover:border-line-2"
      >
        <span className="text-muted">Crypto, investments, goals and net worth</span>
        <ArrowRight size={14} strokeWidth={1.75} className="shrink-0 text-faint" />
      </Link>

      <LogTransaction
        open={logging}
        onClose={() => setLogging(false)}
        onSaved={() => void mutate()}
        defaultAccount={defaults.accountLabel ?? undefined}
        suggestedCategories={defaults.categories}
      />
    </div>
  );
}
