"use client";

import { Pencil } from "lucide-react";

import { SlideOver } from "@/components/ui/SlideOver";
import { Money, Percent, Sensitive } from "@/components/ui/Money";
import type { Holding } from "@/lib/crypto/types";
import { formatQuantity } from "@/lib/format";

/**
 * Tap a coin, see the coin (Romano's ask, 2026-07-24: "if I click XRP,
 * something needs to happen"). Opened from Core 5 and from the movers list.
 *
 * A coin can sit in several wallets, so this aggregates the position and then
 * breaks it down per wallet — each wallet row jumps straight to editing that
 * exact holding, since cost basis and milestones are per-position.
 */
export function CoinSheet({
  symbol,
  holdings,
  onClose,
  onEdit,
}: {
  symbol: string;
  /** Every holding for this symbol, across wallets. */
  holdings: Holding[];
  onClose: () => void;
  onEdit: (holding: Holding) => void;
}) {
  const priced = holdings.find((h) => h.priceZar !== null);
  const quantity = holdings.reduce((sum, h) => sum + h.quantity, 0);
  const valueZar = holdings.reduce((sum, h) => sum + (h.valueZar ?? 0), 0);
  const investedZar = holdings.reduce((sum, h) => sum + h.investedZar, 0);
  const pnlZar = valueZar - investedZar;
  const pnlPct = investedZar > 0 ? (pnlZar / investedZar) * 100 : null;

  // The soonest un-hit milestone across this coin's positions.
  const nextMilestone = holdings
    .map((h) => h.nextMilestone)
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => (a.distancePct ?? Infinity) - (b.distancePct ?? Infinity))[0];

  return (
    <SlideOver open onClose={onClose} title={symbol} description="Live position across every wallet.">
      <div className="space-y-5">
        <div>
          <p className="flex flex-wrap items-baseline gap-x-3">
            {priced?.priceZar != null ? (
              <Money value={priced.priceZar} className="text-2xl font-semibold tracking-tight" />
            ) : (
              <span className="text-2xl font-semibold text-muted">No live price</span>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <ChangeStat label="24h" value={priced?.change24hPct ?? null} />
            <ChangeStat label="7d" value={priced?.change7dPct ?? null} />
            <ChangeStat label="30d" value={priced?.change30dPct ?? null} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
          <Stat label="Holdings">
            <Sensitive>{formatQuantity(quantity)}</Sensitive> {symbol}
          </Stat>
          <Stat label="Value">
            <Money value={valueZar} variant="whole" />
          </Stat>
          <Stat label="Invested">
            <Money value={investedZar} variant="whole" />
          </Stat>
          <Stat label="P&L">
            <Money value={pnlZar} variant="whole" signed />
            {pnlPct !== null ? (
              <span className="ml-1.5 text-[11px]"><Percent value={pnlPct} signed /></span>
            ) : null}
          </Stat>
        </dl>

        {nextMilestone ? (
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
              Next milestone
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              <span className="font-medium">M{nextMilestone.milestone.level}</span>
              {nextMilestone.distancePct !== null ? (
                <span className="text-muted"> · <Percent value={nextMilestone.distancePct} /> away</span>
              ) : null}
              <span className="mt-0.5 block text-[11px] text-faint">
                <Sensitive>{nextMilestone.milestone.raw}</Sensitive>
              </span>
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
            By wallet
          </p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {holdings
              .slice()
              .sort((a, b) => (b.valueZar ?? 0) - (a.valueZar ?? 0))
              .map((holding) => (
                <li key={holding.recordId}>
                  <button
                    type="button"
                    onClick={() => onEdit(holding)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{holding.wallet}</p>
                      <p className="truncate text-[11px] text-faint">
                        <Sensitive>{formatQuantity(holding.quantity)}</Sensitive> {symbol}
                        {holding.pnlPct !== null ? (
                          <> · <Percent value={holding.pnlPct} signed /></>
                        ) : null}
                      </p>
                    </div>
                    <Money value={holding.valueZar ?? 0} variant="whole" className="shrink-0 text-sm" />
                    <Pencil size={13} strokeWidth={1.75} className="shrink-0 text-faint" />
                  </button>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">Tap a wallet to edit that position.</p>
        </div>
      </div>
    </SlideOver>
  );
}

function ChangeStat({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="text-faint">
      {label}{" "}
      {value !== null ? <Percent value={value} signed /> : <span className="text-muted">—</span>}
    </span>
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
