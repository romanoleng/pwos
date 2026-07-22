"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { iconForCategory } from "@/lib/categoryIcons";
import { formatDate } from "@/lib/format";
import {
  calendarWeeks, groupByMonth, monthsPresent, summariseCategories, type ViewRow,
} from "@/lib/transactionViews";

/**
 * Calendar, Monthly and Summary views of the filtered transactions.
 *
 * The flat list answers "what did I just log". These answer the questions it
 * can't: which days money actually leaves, whether this month is worse than
 * the last, and where it all goes.
 *
 * They read whatever the list is showing, so the search box and type filters
 * apply here too rather than being silently ignored.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function CalendarView({
  rows,
  onPickDay,
}: {
  rows: ViewRow[];
  onPickDay?: (date: string) => void;
}) {
  const months = monthsPresent(rows);
  const [index, setIndex] = useState(0);
  const month = months[index] ?? new Date().toISOString().slice(0, 7);
  const weeks = calendarWeeks(rows, month);

  if (months.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-muted">
          Nothing to show for this filter.
        </CardBody>
      </Card>
    );
  }

  const monthTotal = weeks
    .flat()
    .reduce((t, d) => ({ income: t.income + d.incomeZar, expense: t.expense + d.expenseZar }),
      { income: 0, expense: 0 });

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <button
          type="button"
          disabled={index >= months.length - 1}
          onClick={() => setIndex((i) => i + 1)}
          aria-label="Earlier month"
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <p className="text-sm font-medium">{formatMonth(month)}</p>
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
          aria-label="Later month"
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="px-2 py-3">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day, i) => (
            <span key={`${day}-${i}`} className="pb-1 text-center text-[10px] text-faint">
              {day}
            </span>
          ))}
          {weeks.flat().map((day, i) => (
            <div
              key={day.date ?? `pad-${i}`}
              className={`min-h-[3.25rem] rounded-md px-1 pb-1 pt-0.5 ${
                day.date ? "bg-surface-2" : ""
              }`}
            >
              {day.date ? (
                <button
                  type="button"
                  onClick={() => day.count > 0 && onPickDay?.(day.date!)}
                  disabled={day.count === 0}
                  className="block w-full text-left disabled:cursor-default"
                >
                  <span className="text-[10px] text-faint">{day.dayOfMonth}</span>
                  {day.expenseZar > 0 ? (
                    <span className="mt-0.5 block truncate text-[10px] leading-tight text-loss">
                      −{Math.round(day.expenseZar).toLocaleString("en-ZA")}
                    </span>
                  ) : null}
                  {day.incomeZar > 0 ? (
                    <span className="block truncate text-[10px] leading-tight text-gain">
                      +{Math.round(day.incomeZar).toLocaleString("en-ZA")}
                    </span>
                  ) : null}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <CardBody className="flex justify-between border-t border-line py-2.5 text-xs">
        <span className="text-muted">
          Spent <Money value={monthTotal.expense} variant="whole" className="text-ink" />
        </span>
        <span className="text-muted">
          In <Money value={monthTotal.income} variant="whole" className="text-gain" />
        </span>
      </CardBody>
    </Card>
  );
}

export function MonthlyView({ rows }: { rows: ViewRow[] }) {
  const months = groupByMonth(rows);
  // Scale the bars against the worst month so the shape is readable rather
  // than every bar being nearly full.
  const worst = Math.max(...months.map((m) => m.expenseZar), 1);

  if (months.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-muted">
          Nothing to show for this filter.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Month by month" description="Spending and income, newest first." />
      <ul className="divide-y divide-line">
        {months.map((month) => (
          <li key={month.month} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">{formatMonth(month.month)}</p>
              <p className="text-sm">
                <Money value={month.expenseZar} variant="whole" />
                {month.incomeZar > 0 ? (
                  <span className="ml-2 text-[11px] text-gain">
                    +<Money value={month.incomeZar} variant="whole" />
                  </span>
                ) : null}
              </p>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raise">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(month.expenseZar / worst) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-faint">
              {month.count} {month.count === 1 ? "entry" : "entries"} · net{" "}
              <span className={month.netZar < 0 ? "text-loss" : "text-gain"}>
                <Money value={month.netZar} variant="whole" />
              </span>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function SummaryView({
  rows,
  onPickCategory,
}: {
  rows: ViewRow[];
  onPickCategory?: (category: string) => void;
}) {
  const shares = summariseCategories(rows);
  const total = shares.reduce((t, s) => t + s.spentZar, 0);

  if (shares.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-muted">
          No spending to summarise for this filter.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Where it went"
        description="Spending only — income and transfers would make the shares meaningless."
        action={<Money value={total} variant="whole" className="text-sm" />}
      />
      <ul className="divide-y divide-line">
        {shares.map((share) => (
          <li key={share.category}>
            <button
              type="button"
              onClick={() => onPickCategory?.(share.category)}
              className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                  {(() => {
                    const Icon = iconForCategory(share.category);
                    return <Icon size={14} strokeWidth={1.75} className="shrink-0 text-muted" />;
                  })()}
                  <span className="truncate">{share.category}</span>
                </p>
                <p className="shrink-0 text-sm">
                  <Money value={share.spentZar} variant="whole" />
                </p>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raise">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${share.sharePct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-faint">
                {share.sharePct.toFixed(1).replace(".", ",")}% · {share.count}{" "}
                {share.count === 1 ? "entry" : "entries"}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function formatMonth(month: string): string {
  // Build from the 15th: the 1st in UTC is still the previous month in some
  // timezones, which would label July as June.
  return new Date(`${month}-15T00:00:00Z`).toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export { formatDate };
