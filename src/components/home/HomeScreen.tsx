"use client";

import {
  ArrowRight,
  Briefcase,
  CreditCard,
  PiggyBank,
  Plus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { LogTransaction, type EditingTransaction } from "@/components/transactions/LogTransaction";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { PeriodBar, usePeriodKind } from "@/components/ui/PeriodBar";
import { formatDate } from "@/lib/format";
import type { HomeSummary } from "@/lib/server/home";

async function fetcher(url: string): Promise<HomeSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load your dashboard.");
  return response.json();
}

/** Tile icon per account kind — crypto never reaches Home's cards. */
const KIND_ICONS: Record<string, LucideIcon> = {
  cash: CreditCard,
  savings: PiggyBank,
  business: Briefcase,
  other: Wallet,
};

/**
 * Home is the daily driver: what's available, the cards, the budget, and one
 * tap to log what you just spent. Wealth, crypto and goals live elsewhere.
 *
 * Ordered for a phone in a shop — the number that answers "can I buy this?"
 * is first, and the log button is reachable without scrolling.
 */
export function HomeScreen() {
  const periodKind = usePeriodKind();
  const { data, error, mutate } = useSWR<HomeSummary>(`/api/home?period=${periodKind}`, fetcher, {
    keepPreviousData: true,
    refreshInterval: 120_000,
  });
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<EditingTransaction | null>(null);

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
      <LoadingCard rows={4} />
    );
  }

  const { available, cards, budget, today, recent, defaults, period, scheduled } = data;
  const usedPct =
    budget.budgetedZar > 0 ? (budget.spentZar / budget.budgetedZar) * 100 : 0;

  // The first block is about what's spendable — the payment cards only
  // (Romano's ask, 2026-07-23). Savings and business stay one tap away under
  // All. The label names them rather than hardcoding "Capitec Main + GOtyme",
  // which went stale the day a third spendable card arrived.
  const spendableCards = cards.filter((card) => card.spendable);
  const tiles = spendableCards.length > 0 ? spendableCards : cards;
  const spendableLabel =
    spendableCards.length > 0
      ? spendableCards.map((card) => card.label).join(" + ")
      : "No accounts marked spendable";

  return (
    <div className="space-y-4">
      <PeriodBar
        hint={`${period.label} · ${
          period.start ? formatDate(period.start) : "the beginning"
        } → today · ${period.count} ${period.count === 1 ? "entry" : "entries"}`}
      />

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
                {spendableLabel} ·{" "}
                <Money value={available.totalCashZar} variant="whole" /> cash in total
              </p>
            </div>

            <button
              type="button"
              onClick={() => setLogging(true)}
              className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 md:inline-flex"
            >
              <Plus size={16} strokeWidth={2.25} />
              Log
            </button>
          </div>

          {/* The payment cards at a glance, right in the first block (Romano's
              ask, 2026-07-23; narrowed to spendable-only the same day) —
              small tiles that scroll sideways. Savings, business and the rest
              live behind the All tile on Accounts. */}
          <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
            {tiles.map((card) => {
              const Icon = KIND_ICONS[card.kind] ?? Wallet;
              return (
                <Link
                  key={card.id}
                  href="/accounts"
                  className="w-[7.5rem] shrink-0 rounded-lg border border-line bg-surface-2 px-2.5 py-2 transition-colors hover:border-line-2"
                >
                  <p className="flex items-center gap-1.5 text-[10px] text-faint">
                    <Icon size={11} strokeWidth={1.75} className="shrink-0" />
                    <span className="truncate">{card.label}</span>
                  </p>
                  {card.balanceZar === null ? (
                    <p className="mt-1 text-[11px] text-warn">Not recorded</p>
                  ) : (
                    <Money
                      value={card.balanceZar}
                      variant="whole"
                      className="mt-1 block truncate text-[13px] font-medium"
                    />
                  )}
                </Link>
              );
            })}
            <Link
              href="/accounts"
              className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-line text-[10px] text-muted transition-colors hover:border-line-2 hover:text-ink"
            >
              <ArrowRight size={13} strokeWidth={1.75} />
              All
            </Link>
          </div>

          {/* The old three-card stack, compressed to rows: spent and came-in
              for the selected period, then the budget as a slim bar. Recent
              now fits on the first screen, which is the log-and-glance flow. */}
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
            <div>
              <dt className="text-[11px] text-faint">Spent</dt>
              <dd className="mt-0.5 text-sm font-medium">
                <Money value={period.spentZar} variant="whole" />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-faint">Came in</dt>
              <dd className="mt-0.5 text-sm font-medium">
                <Money value={period.incomeZar} variant="whole" className="text-gain" />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-faint">Today</dt>
              <dd className="mt-0.5 text-sm font-medium">
                {today.count > 0 ? (
                  <Money value={today.spendZar} variant="whole" />
                ) : (
                  <span className="text-faint">—</span>
                )}
              </dd>
            </div>
          </dl>

          <Link href="/budgets" className="mt-3 block border-t border-line pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] text-faint">
                {budget.overspent ? "Over budget by " : "Budget left "}
                <Money
                  value={Math.abs(budget.remainingZar)}
                  variant="whole"
                  className={`text-sm font-medium ${budget.overspent ? "text-loss" : "text-ink"}`}
                />
                {budget.dailyAllowanceZar !== null ? (
                  <span className="ml-1.5">
                    · <Money value={budget.dailyAllowanceZar} variant="whole" /> a day
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-faint">
                {budget.daysLeft} {budget.daysLeft === 1 ? "day" : "days"} left
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-raise">
              <div
                className={`h-full rounded-full ${budget.overspent ? "bg-loss" : "bg-accent"}`}
                style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
              />
            </div>
          </Link>
        </CardBody>
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
        {scheduled.count > 0 ? (
          <p className="border-b border-line px-4 py-2 text-[11px] text-faint">
            {scheduled.count === 1 ? "1 entry" : `${scheduled.count} entries`} scheduled
            ahead{scheduled.nextDate ? ` · lands ${formatDate(scheduled.nextDate)}` : ""} ·{" "}
            <Money value={scheduled.totalZar} variant="whole" signed />
          </p>
        ) : null}
        {recent.length === 0 ? (
          <CardBody className="py-8 text-center">
            <p className="text-sm font-medium">Nothing logged yet</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted">
              The last few entries land here, so a glance shows the day.
            </p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((row) => (
              <li key={row.recordId}>
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      recordId: row.recordId,
                      description: row.description,
                      amountZar: row.amountZar,
                      category: row.category,
                      subcategory: row.subcategory,
                      accountLabel: row.accountLabel,
                      date: row.date,
                      notes: row.notes,
                    })
                  }
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
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
                </button>
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
        recentDescriptions={defaults.descriptions}
        accounts={defaults.accounts}
        allCategories={defaults.allCategories}
        kidAccounts={defaults.kidAccounts}
        suggestsNewCycle={defaults.suggestsNewCycle}
        quickLinks={defaults.quickLinks}
        frequent={defaults.frequent}
      />

      {editing ? (
        <LogTransaction
          key={editing.recordId}
          open
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
          accounts={defaults.accounts}
          allCategories={defaults.allCategories}
          kidAccounts={defaults.kidAccounts}
          suggestsNewCycle={defaults.suggestsNewCycle}
          quickLinks={defaults.quickLinks}
          frequent={defaults.frequent}
        />
      ) : null}
    </div>
  );
}
