"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { LiveIndicator } from "@/components/crypto/LiveIndicator";
import { PortfolioChart } from "@/components/crypto/PortfolioChart";
import { MilestoneLadder } from "@/components/crypto/MilestoneLadder";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money, Percent } from "@/components/ui/Money";
import { FREEDOM_TARGET_ZAR } from "@/lib/constants";
import type { Holding, Portfolio } from "@/lib/crypto/types";
import { formatPercent, formatQuantity } from "@/lib/format";

type ApiError = { error: string; message: string; variable?: string };

async function fetcher(url: string): Promise<Portfolio> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw Object.assign(new Error(body?.message ?? "Request failed"), {
      info: body,
      status: response.status,
    });
  }
  return response.json();
}

export function CryptoDashboard({ initial }: { initial?: Portfolio }) {
  const { data, error, isValidating } = useSWR<Portfolio>(
    "/api/crypto/portfolio",
    fetcher,
    {
      // §5: client polls our cached endpoint ~60s; the server caches upstream.
      refreshInterval: 60_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
      fallbackData: initial,
    },
  );

  if (error && !data) {
    const info = (error as { info?: ApiError }).info;
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-loss">Couldn&apos;t load the portfolio</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {info?.message ?? error.message}
          </p>
          {info?.variable ? (
            <p className="mt-3 text-xs leading-relaxed text-faint">
              Add it to <code className="text-ink">.env.local</code>, then restart the dev
              server. Nothing here is hardcoded, so the module stays empty until it can
              read your real data.
            </p>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-muted">
          Loading live prices…
        </CardBody>
      </Card>
    );
  }

  const { meta, wallets, core5, gainers, losers, milestoneHits } = data;

  return (
    <div className="space-y-4">
      <PortfolioHeader
        data={data}
        isValidating={isValidating}
      />

      {milestoneHits.length > 0 ? <MilestoneHitBanner holdings={milestoneHits} /> : null}

      {meta.staleReason ? (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          Showing cached prices — live fetch failed ({meta.staleReason}).
        </p>
      ) : null}

      <PortfolioChart totals={data.totals} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Core5Card holdings={core5} />
        <MoversCard gainers={gainers} losers={losers} />
      </div>

      {wallets.map((group) => (
        <Card key={group.wallet}>
          <CardHeader
            title={group.wallet}
            description={`${group.holdings.length} ${
              group.holdings.length === 1 ? "position" : "positions"
            } · ${formatPercent(group.weightPct)} of portfolio`}
            action={
              <div className="text-right">
                <Money value={group.valueZar} variant="whole" className="text-sm" />
                <div className="text-xs">
                  <Money value={group.pnlZar} variant="whole" signed />
                </div>
              </div>
            }
          />
          <HoldingsTable holdings={group.holdings} />
        </Card>
      ))}

      {(meta.fallbackSymbols.length > 0 || meta.unpricedSymbols.length > 0) && (
        <p className="text-xs leading-relaxed text-faint">
          {meta.fallbackSymbols.length > 0 && (
            <>
              Valued from stored Airtable prices (no CoinGecko id):{" "}
              <span className="text-muted">{meta.fallbackSymbols.join(", ")}</span>.{" "}
            </>
          )}
          {meta.unpricedSymbols.length > 0 && (
            <>
              No price available, excluded from totals:{" "}
              <span className="text-muted">{meta.unpricedSymbols.join(", ")}</span>.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function PortfolioHeader({
  data,
  isValidating,
}: {
  data: Portfolio;
  isValidating: boolean;
}) {
  const { totals, meta } = data;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Portfolio value
          </p>
          <LiveIndicator
            fetchedAt={meta.pricesFetchedAt}
            staleReason={meta.staleReason}
            isValidating={isValidating}
          />
        </div>

        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
          <Money
            value={totals.valueZar}
            variant="whole"
            className="text-3xl font-semibold tracking-tight md:text-4xl"
          />
          {totals.change24hPct !== null ? (
            <span className="text-sm">
              <Percent value={totals.change24hPct} signed /> <span className="text-faint">24h</span>
            </span>
          ) : null}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Stat label="Invested">
            <Money value={totals.investedZar} variant="whole" />
          </Stat>
          <Stat label="Unrealised P&L">
            <Money value={totals.pnlZar} variant="whole" signed />
          </Stat>
          <Stat label="Return">
            {totals.pnlPct !== null ? (
              <Percent value={totals.pnlPct} signed />
            ) : (
              <span className="text-muted">—</span>
            )}
          </Stat>
          <Stat label="24h">
            {totals.change24hZar !== null ? (
              <Money value={totals.change24hZar} variant="whole" signed />
            ) : (
              <span className="text-muted">—</span>
            )}
          </Stat>
        </dl>

        <div className="mt-6">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">
              Freedom number · <Money value={FREEDOM_TARGET_ZAR} variant="compact" />
            </span>
            <span className="tnum text-ink">
              {formatPercent(totals.freedomProgressPct)}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-raise">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700"
              style={{ width: `${Math.min(100, Math.max(0, totals.freedomProgressPct))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-faint">
            <Money value={totals.freedomRemainingZar} variant="whole" /> to go · crypto
            only
          </p>
        </div>
      </CardBody>
    </Card>
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

function MilestoneHitBanner({ holdings }: { holdings: Holding[] }) {
  return (
    <div className="rounded-xl border border-gain/40 bg-gain/5 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gain">
        Milestone hit
      </p>
      <ul className="mt-2 space-y-1.5">
        {holdings.map((holding) => (
          <li key={holding.recordId} className="text-xs leading-relaxed">
            <span className="font-medium text-ink">{holding.symbol}</span>{" "}
            <span className="text-faint">({holding.wallet})</span>{" "}
            <span className="text-muted">
              — M{holding.lastHitMilestone?.milestone.level}:{" "}
              {holding.lastHitMilestone?.milestone.raw}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Core5Card({ holdings }: { holdings: Holding[] }) {
  return (
    <Card>
      <CardHeader
        title="Core 5"
        description="The only coins getting fresh capital — DCA on the 24th."
      />
      {holdings.length === 0 ? (
        <CardBody className="text-xs text-faint">
          None of BTC, ETH, XRP, HBAR or ENA found in Holdings.
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {holdings.map((holding) => (
            <li
              key={holding.recordId}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{holding.symbol}</p>
                <p className="truncate text-[11px] text-faint">{holding.wallet}</p>
              </div>
              <div className="text-right">
                <Money
                  value={holding.valueZar ?? 0}
                  variant="whole"
                  className="text-sm"
                />
                <p className="text-[11px]">
                  {holding.change24hPct !== null ? (
                    <Percent value={holding.change24hPct} signed />
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MoversCard({ gainers, losers }: { gainers: Portfolio["gainers"]; losers: Portfolio["losers"] }) {
  return (
    <Card>
      <CardHeader title="24h movers" description="Across every wallet." />
      <CardBody className="grid gap-5 sm:grid-cols-2">
        <MoverList title="Gainers" movers={gainers} empty="Nothing up today." />
        <MoverList title="Losers" movers={losers} empty="Nothing down today." />
      </CardBody>
    </Card>
  );
}

function MoverList({
  title,
  movers,
  empty,
}: {
  title: string;
  movers: Portfolio["gainers"];
  empty: string;
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        {title}
      </p>
      {movers.length === 0 ? (
        <p className="text-xs text-faint">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {movers.map((mover) => (
            <li
              key={`${mover.symbol}-${mover.wallet}`}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className="font-medium">{mover.symbol}</span>
              <Percent value={mover.change24hPct} signed />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-line">
      {holdings.map((holding) => {
        const open = expanded === holding.recordId;
        return (
          <li key={holding.recordId}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : holding.recordId)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {holding.symbol}
                  {holding.priceSource === "airtable-fallback" ? (
                    <span
                      title="No live price — valued from the stored Airtable figure"
                      className="rounded bg-raise px-1 py-0.5 text-[9px] font-medium uppercase text-muted"
                    >
                      stored
                    </span>
                  ) : null}
                  {holding.milestonesHitCount > 0 ? (
                    <span className="rounded bg-gain/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-gain">
                      M{holding.lastHitMilestone?.milestone.level}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-faint">
                  <span className="tnum">{formatQuantity(holding.quantity)}</span>
                  {holding.priceZar !== null ? (
                    <>
                      {" @ "}
                      <Money value={holding.priceZar} variant="unit" />
                    </>
                  ) : null}
                </p>
              </div>

              <div className="text-right">
                <Money
                  value={holding.valueZar ?? 0}
                  variant="whole"
                  className="text-sm"
                />
                <p className="text-[11px]">
                  {holding.pnlPct !== null ? (
                    <Percent value={holding.pnlPct} signed />
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                  {holding.weightPct !== null ? (
                    <span className="tnum ml-2 text-faint">
                      {formatPercent(holding.weightPct)}
                    </span>
                  ) : null}
                </p>
              </div>

              <ChevronDown
                size={15}
                strokeWidth={1.75}
                className={`shrink-0 text-faint transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>

            {open ? (
              <div className="border-t border-line bg-bg/40 px-4 py-3">
                <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <Stat label="Invested">
                    <Money value={holding.investedZar} variant="whole" />
                  </Stat>
                  <Stat label="P&L">
                    <Money value={holding.pnlZar ?? 0} variant="whole" signed />
                  </Stat>
                  <Stat label="Quantity">
                    <span className="tnum">{formatQuantity(holding.quantity)}</span>
                  </Stat>
                  <Stat label="Weight">
                    {holding.weightPct !== null ? (
                      <Percent value={holding.weightPct} />
                    ) : (
                      "—"
                    )}
                  </Stat>
                </dl>
                <MilestoneLadder statuses={holding.milestoneStatuses} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
