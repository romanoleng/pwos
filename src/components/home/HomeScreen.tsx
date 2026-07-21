"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { Card, CardBody } from "@/components/ui/Card";
import { Money, Percent } from "@/components/ui/Money";
import { formatPercent } from "@/lib/format";
import type { HomeSummary } from "@/lib/server/home";

async function fetcher(url: string): Promise<HomeSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load your dashboard.");
  return response.json();
}

export function HomeScreen() {
  const { data, error } = useSWR<HomeSummary>("/api/home", fetcher, {
    refreshInterval: 90_000,
  });

  if (error) {
    return <Card><CardBody className="text-sm text-loss">Couldn&apos;t load your dashboard.</CardBody></Card>;
  }
  if (!data) {
    return <Card><CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody></Card>;
  }

  const { freedom, crypto, cash, budget, nextMilestone, movers } = data;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="py-7">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Freedom number · {freedom.targetLabel}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
            <Money
              value={freedom.progressZar}
              variant="whole"
              className="text-4xl font-semibold tracking-tight md:text-5xl"
            />
            <span className="text-sm text-muted">
              of <Money value={freedom.targetZar} variant="compact" />
            </span>
          </p>

          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-raise">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700"
              style={{ width: `${Math.min(100, Math.max(0, freedom.progressPct))}%` }}
            />
          </div>
          <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
            <span className="tnum text-ink">{formatPercent(freedom.progressPct)}</span>
            <span className="text-faint">
              <Money value={freedom.remainingZar} variant="whole" /> to go
            </span>
          </p>

          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
            True net worth today is{" "}
            <Money
              value={data.netWorthZar}
              variant="whole"
              className={data.netWorthZar < 0 ? "text-loss" : ""}
            />{" "}
            after debt. The number above is what you own; clearing the home loan and
            the debt review is what the R2m unlocks.
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          href="/crypto"
          label="Crypto"
          value={<Money value={crypto.valueZar} variant="whole" />}
          sub={
            crypto.change24hPct !== null ? (
              <Percent value={crypto.change24hPct} signed />
            ) : (
              <span className="text-faint">—</span>
            )
          }
        />
        <Tile
          href="/accounts"
          label="Safe to spend"
          value={<Money value={cash.spendableZar} variant="whole" />}
          sub={<span className="text-faint">of <Money value={cash.totalZar} variant="whole" /> cash</span>}
        />
        <Tile
          href="/budgets"
          label={budget.overspent ? "Over budget" : "Budget left"}
          value={
            <Money
              value={Math.abs(budget.remainingZar)}
              variant="whole"
              className={budget.overspent ? "text-loss" : ""}
            />
          }
          sub={<span className="text-faint">{budget.daysLeft}d left in cycle</span>}
        />
        <Tile
          href="/debt"
          label="Net worth"
          value={
            <Money
              value={data.netWorthZar}
              variant="whole"
              className={data.netWorthZar < 0 ? "text-loss" : ""}
            />
          }
          sub={<span className="text-faint">after all debt</span>}
        />
      </div>

      {nextMilestone ? (
        <Card>
          <CardBody>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              Next milestone
            </p>
            <p className="mt-1.5 text-sm">
              <span className="font-medium">{nextMilestone.symbol}</span> M
              {nextMilestone.level} —{" "}
              <span className="text-muted">
                {formatPercent(nextMilestone.distancePct)} away
              </span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {nextMilestone.instruction}
            </p>
            <Link
              href="/crypto"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              See all milestones
              <ArrowRight size={13} strokeWidth={2} />
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {movers.length > 0 ? (
        <Card>
          <CardBody>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              24h movers
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
              {movers.map((mover) => (
                <li key={mover.symbol} className="text-xs">
                  <span className="font-medium">{mover.symbol}</span>{" "}
                  <Percent value={mover.change24hPct} signed />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function Tile({
  href,
  label,
  value,
  sub,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-2"
    >
      <p className="text-[11px] text-faint">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px]">{sub}</p>
    </Link>
  );
}
