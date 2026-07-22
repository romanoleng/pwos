"use client";

import { useState } from "react";
import useSWR from "swr";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { PeriodBar, usePeriodKind } from "@/components/ui/PeriodBar";
import { formatDate } from "@/lib/format";
import type { StatSlice, StatsSummary } from "@/lib/server/stats";

async function fetcher(url: string): Promise<StatsSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load stats.");
  return response.json();
}

/**
 * Where money comes from and where it goes.
 *
 * The rest of the app answers "what did I just log" and "am I within budget".
 * This answers "what is actually happening" — and the income half has no home
 * anywhere else. Romano is paid by clients rather than a payroll, so "is this
 * month normal?" is a real question no other screen can answer.
 *
 * Ranked bars, not a pie: fourteen categories in a pie gives truncated labels,
 * crossing leader lines and unreadable slivers. A list carries the same
 * information legibly at any category count.
 */
export function StatsScreen() {
  const periodKind = usePeriodKind();
  const { data, error } = useSWR<StatsSummary>(`/api/stats?period=${periodKind}`, fetcher, {
    refreshInterval: 120_000,
  });
  const [side, setSide] = useState<"expense" | "income">("expense");

  if (error) {
    return (
      <Card>
        <CardBody className="text-sm text-loss">Couldn&apos;t load stats.</CardBody>
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

  const { income, expense, months, previous, period } = data;
  const showing = side === "income" ? income : expense;
  const previousTotal =
    previous === null ? null : side === "income" ? previous.incomeZar : previous.expenseZar;
  const delta = previousTotal === null ? null : showing.totalZar - previousTotal;

  return (
    <div className="space-y-4">
      <PeriodBar
        hint={`${period.label} · ${
          period.start ? formatDate(period.start) : "the beginning"
        } → today`}
      />

      {/* Both figures always visible; the toggle only chooses which one the
          breakdown is about. Hiding income behind a tab would make the two
          impossible to compare at a glance. */}
      <Card>
        <CardBody className="grid grid-cols-2 gap-3">
          <SideButton
            label="Money in"
            value={income.totalZar}
            count={income.count}
            tone="gain"
            selected={side === "income"}
            onSelect={() => setSide("income")}
          />
          <SideButton
            label="Money out"
            value={expense.totalZar}
            count={expense.count}
            tone="loss"
            selected={side === "expense"}
            onSelect={() => setSide("expense")}
          />
          <div className="col-span-2 border-t border-line pt-3">
            <p className="text-[11px] text-faint">
              Net{" "}
              <Money
                value={data.netZar}
                variant="whole"
                signed
                className={data.netZar < 0 ? "text-loss" : "text-gain"}
              />
              {delta !== null ? (
                <>
                  {" · "}
                  <Money value={Math.abs(delta)} variant="whole" />{" "}
                  {delta >= 0 ? "more" : "less"} than the {previous?.label}
                </>
              ) : null}
            </p>
          </div>
        </CardBody>
      </Card>

      <Breakdown
        title={side === "income" ? "Where it came from" : "Where it went"}
        description={
          side === "income"
            ? "By category."
            : "By category. Transfers and money put away are excluded."
        }
        slices={showing.byCategory}
      />

      <Breakdown
        title={side === "income" ? "Who paid" : "Paid from"}
        description={
          side === "income"
            ? "Descriptions collapsed, so one payer is one row."
            : "Which account the money actually left."
        }
        slices={side === "income" ? income.bySource : expense.byAccount}
      />

      <Trend months={months} />
    </div>
  );
}

function SideButton({
  label, value, count, tone, selected, onSelect,
}: {
  label: string;
  value: number;
  count: number;
  tone: "gain" | "loss";
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2"
      }`}
    >
      <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </span>
      <Money
        value={value}
        variant="whole"
        className={`mt-1 block text-xl font-semibold tracking-tight ${
          tone === "gain" ? "text-gain" : ""
        }`}
      />
      <span className="mt-0.5 block text-[11px] text-faint">
        {count} {count === 1 ? "entry" : "entries"}
      </span>
    </button>
  );
}

function Breakdown({
  title, description, slices,
}: {
  title: string;
  description: string;
  slices: StatSlice[];
}) {
  if (slices.length === 0) {
    return (
      <Card>
        <CardHeader title={title} description={description} />
        <CardBody className="py-8 text-center text-xs text-muted">
          Nothing in this period yet.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <ul className="divide-y divide-line">
        {slices.map((slice) => (
          <li key={slice.label} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium">{slice.label}</p>
              <p className="shrink-0 text-sm">
                <Money value={slice.amountZar} variant="whole" />
              </p>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raise">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${slice.sharePct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-faint">
              {slice.sharePct.toFixed(1).replace(".", ",")}% · {slice.count}{" "}
              {slice.count === 1 ? "entry" : "entries"}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Trend({ months }: { months: { month: string; incomeZar: number; expenseZar: number }[] }) {
  if (months.length === 0) return null;
  // Scale both series against one maximum, or the two bars would imply a
  // relationship that isn't there.
  const peak = Math.max(...months.flatMap((m) => [m.incomeZar, m.expenseZar]), 1);

  return (
    <Card>
      <CardHeader
        title="Twelve months"
        description="In and out per month, whatever period is selected above."
      />
      <CardBody>
        <ul className="space-y-2.5">
          {months.map((month) => (
            <li key={month.month}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-muted">{monthLabel(month.month)}</span>
                <span className="text-faint">
                  <Money value={month.incomeZar} variant="whole" className="text-gain" />
                  {" · "}
                  <Money value={month.expenseZar} variant="whole" />
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                <div className="h-1.5 w-full rounded-full bg-raise">
                  <div
                    className="h-full rounded-full bg-gain"
                    style={{ width: `${(month.incomeZar / peak) * 100}%` }}
                  />
                </div>
                <div className="h-1.5 w-full rounded-full bg-raise">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(month.expenseZar / peak) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function monthLabel(month: string): string {
  // Built from the 15th: the 1st in UTC is still the previous month in some
  // zones, which would label July as June.
  return new Date(`${month}-15T00:00:00Z`).toLocaleDateString("en-ZA", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
