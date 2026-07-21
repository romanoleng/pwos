"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import {
  historyGapDays,
  withLivePoint,
  type HistoryPoint,
} from "@/lib/crypto/history";
import type { PortfolioTotals } from "@/lib/crypto/types";
import { formatDate, formatMoneyCompact } from "@/lib/format";

const RANGES = [
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "all", label: "All", days: Number.POSITIVE_INFINITY },
] as const;

async function fetcher(url: string): Promise<{ series: HistoryPoint[] }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("history unavailable");
  return response.json();
}

export function PortfolioChart({ totals }: { totals: PortfolioTotals }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("90d");

  // History changes at most daily; no polling.
  const { data, error } = useSWR("/api/crypto/history", fetcher, {
    revalidateOnFocus: false,
  });

  const { series, gapDays } = useMemo(() => {
    const stored = data?.series ?? [];
    const now = new Date();
    const full = withLivePoint(
      stored,
      {
        valueZar: totals.valueZar,
        investedZar: totals.investedZar,
        pnlZar: totals.pnlZar,
        freedomProgressPct: totals.freedomProgressPct,
      },
      now,
    );
    const days = RANGES.find((option) => option.key === range)!.days;
    const cutoff = now.getTime() - days * 86_400_000;
    return {
      series: Number.isFinite(days) ? full.filter((point) => point.t >= cutoff) : full,
      gapDays: historyGapDays(full, now),
    };
  }, [data, totals, range]);

  const hasHistory = series.filter((point) => !point.live).length > 0;

  return (
    <Card>
      <CardHeader
        title="Portfolio value"
        description="Value against what you put in."
        action={
          <div className="flex gap-0.5 rounded-lg border border-line p-0.5">
            {RANGES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRange(option.key)}
                className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                  range === option.key
                    ? "bg-raise text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        {error ? (
          <p className="py-8 text-center text-xs text-muted">
            History unavailable right now.
          </p>
        ) : !hasHistory ? (
          <p className="py-8 text-center text-xs text-muted">
            No stored history yet — save a snapshot to start the chart.
          </p>
        ) : (
          <>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="pwos-value" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(value: number) =>
                      new Intl.DateTimeFormat("en-ZA", {
                        timeZone: "Africa/Johannesburg",
                        day: "2-digit",
                        month: "short",
                      }).format(value)
                    }
                    tick={{ fill: "var(--faint)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--line)" }}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    tickFormatter={(value: number) => formatMoneyCompact(value)}
                    tick={{ fill: "var(--faint)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={54}
                  />
                  <Tooltip content={<ChartTooltip />} />

                  {/* Cost basis first, so value draws on top of it. */}
                  <Line
                    type="monotone"
                    dataKey="investedZar"
                    stroke="var(--muted)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="valueZar"
                    stroke="var(--accent)"
                    strokeWidth={1.75}
                    fill="url(#pwos-value)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3 rounded bg-accent" />
                Value
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3 rounded bg-muted" />
                Invested
              </span>
              {gapDays !== null && gapDays > 1 ? (
                <span className="text-warn">
                  Last saved snapshot was {gapDays} days ago — the line jumps straight to
                  today.
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: { payload: HistoryPoint }[];
};

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-lg border border-line-2 bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 text-[11px] text-faint">
        {formatDate(point.t)}
        {point.live ? " · live" : ""}
      </p>
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-muted">Value</span>
        <Money value={point.valueZar} variant="whole" />
      </p>
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-muted">Invested</span>
        <Money value={point.investedZar} variant="whole" />
      </p>
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-muted">P&amp;L</span>
        <Money value={point.pnlZar} variant="whole" signed />
      </p>
    </div>
  );
}
