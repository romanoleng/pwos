"use client";

import { ArrowDown, ArrowDownUp, ArrowUp, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Money, Percent, Sensitive } from "@/components/ui/Money";
import { SlideOver } from "@/components/ui/SlideOver";
import {
  ALL_COLUMNS,
  DEFAULT_COINS_PREFS,
  aggregateByCoin,
  pnlPctOf,
  sortCoins,
  usdFactor,
  type CoinColumn,
  type CoinRow,
  type CoinsPrefs,
  type CoinSort,
  type Timeframe,
} from "@/lib/crypto/coinsView";
import type { Holding, PortfolioTotals } from "@/lib/crypto/types";
import { formatQuantity } from "@/lib/format";

const PREFS_KEY = "pwos-coins-prefs";
const TIMEFRAMES: Timeframe[] = ["24h", "7d", "30d"];
const TF_LABEL: Record<Timeframe, string> = { "24h": "24H", "7d": "7D", "30d": "30D" };
const SORTS: { key: CoinSort; label: string }[] = [
  { key: "value", label: "Value" },
  { key: "change", label: "% change" },
  { key: "pnl", label: "P&L" },
  { key: "invested", label: "Invested" },
  { key: "holdings", label: "Holdings" },
  { key: "symbol", label: "Name" },
];

function loadPrefs(): CoinsPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_COINS_PREFS;
    const parsed = JSON.parse(raw) as Partial<CoinsPrefs>;
    const columns = Array.isArray(parsed.columns)
      ? parsed.columns.filter((c): c is CoinColumn => ALL_COLUMNS.some((x) => x.key === c)).slice(0, 2)
      : DEFAULT_COINS_PREFS.columns;
    return {
      ...DEFAULT_COINS_PREFS,
      ...parsed,
      columns: columns.length > 0 ? columns : DEFAULT_COINS_PREFS.columns,
    };
  } catch {
    return DEFAULT_COINS_PREFS;
  }
}

/**
 * The "All coins" list (Romano's ask, 2026-07-25) — one row per coin, totalled
 * across wallets, with a Display Preferences sheet for timeframe, columns,
 * currency and sort. A flat alternative to the by-wallet grouping.
 */
export function AllCoinsView({
  holdings,
  totals,
  onPick,
}: {
  holdings: Holding[];
  totals: PortfolioTotals;
  onPick: (symbol: string) => void;
}) {
  const [prefs, setPrefs] = useState<CoinsPrefs>(DEFAULT_COINS_PREFS);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);

  function update(patch: Partial<CoinsPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* private browsing — in-memory only */
      }
      return next;
    });
  }

  const rows = useMemo(() => sortCoins(aggregateByCoin(holdings), prefs), [holdings, prefs]);
  const factor = useMemo(() => usdFactor(rows), [rows]);
  const usd = prefs.currency === "usd";
  const cur = usd ? "USD" : "ZAR";
  // USD needs the zar→usd factor; if we don't have one, fall back to ZAR rather
  // than show blanks.
  const canUsd = factor !== null;
  const effUsd = usd && canUsd;

  const gridTemplate = `minmax(0,1fr) ${prefs.columns.map(() => "minmax(0,auto)").join(" ")}`;

  // The sort key a column header maps to. Price sorts by the timeframe's %
  // change (like the reference's "Price / 7D"); Holdings by value; P&L by P&L.
  const colSort = (col: CoinColumn): CoinSort =>
    col === "price" ? "change" : col === "holdings" ? "value" : col === "invested" ? "invested" : "pnl";

  // Tapping a header sorts by it, highest → lowest first (Romano's ask); a
  // second tap on the same header flips to lowest → highest.
  function sortByHeader(key: CoinSort) {
    update({ sort: key, dir: prefs.sort === key && prefs.dir === "desc" ? "asc" : "desc" });
  }

  const SortArrow = ({ active }: { active: boolean }) =>
    !active ? (
      <ArrowDownUp size={10} strokeWidth={2} className="opacity-40" />
    ) : prefs.dir === "desc" ? (
      <ArrowDown size={10} strokeWidth={2.5} className="text-accent" />
    ) : (
      <ArrowUp size={10} strokeWidth={2.5} className="text-accent" />
    );

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {prefs.showOverview ? (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              Portfolio value
            </p>
            <Money
              value={effUsd ? totals.valueZar * (factor as number) : totals.valueZar}
              currency={cur}
              variant="whole"
              className="mt-0.5 block text-2xl font-semibold tracking-tight"
            />
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <p className="text-[11px] text-faint">Invested</p>
              <p className="mt-0.5 text-sm font-medium">
                <Money value={totals.investedZar} variant="whole" />
              </p>
            </div>
            <div>
              <p className="text-[11px] text-faint">24h</p>
              <p className="mt-0.5 text-sm font-medium">
                {totals.change24hPct === null ? (
                  <span className="text-faint">—</span>
                ) : (
                  <Percent value={totals.change24hPct} signed />
                )}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-faint">Total P&amp;L</p>
              <p className="mt-0.5 text-sm font-medium">
                <Money value={totals.pnlZar} variant="whole" signed />
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* controls */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5 text-[11px] font-medium">
          {(["zar", "usd"] as const).map((c) => (
            <button
              key={c}
              type="button"
              disabled={c === "usd" && !canUsd}
              onClick={() => update({ currency: c })}
              className={`rounded-md px-2.5 py-1 uppercase transition-colors disabled:opacity-40 ${
                prefs.currency === c ? "bg-accent text-white" : "text-muted hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-line-2 hover:text-ink"
        >
          <SlidersHorizontal size={13} strokeWidth={1.9} />
          Display
        </button>
      </div>

      {/* header */}
      <div
        className="grid items-center gap-3 border-y border-line px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <button
          type="button"
          onClick={() => sortByHeader("symbol")}
          className={`flex items-center gap-1 text-left uppercase hover:text-muted ${
            prefs.sort === "symbol" ? "text-muted" : ""
          }`}
        >
          Coin
          <SortArrow active={prefs.sort === "symbol"} />
        </button>
        {prefs.columns.map((col) => {
          const key = colSort(col);
          const active = prefs.sort === key;
          return (
            <button
              key={col}
              type="button"
              onClick={() => sortByHeader(key)}
              className={`flex items-center justify-end gap-1 uppercase hover:text-muted ${
                active ? "text-muted" : ""
              }`}
            >
              {col === "price" ? `Price / ${TF_LABEL[prefs.timeframe]}` : null}
              {col === "holdings" ? "Total Holdings" : null}
              {col === "invested" ? "Total Invested" : null}
              {col === "pnl" ? "Total P&L" : null}
              <SortArrow active={active} />
            </button>
          );
        })}
      </div>

      {/* rows */}
      {ready && rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted">No coins to show.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.symbol}>
              <button
                type="button"
                onClick={() => onPick(row.symbol)}
                className="grid w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    <Sensitive>{row.symbol}</Sensitive>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-faint">
                    {row.coin && row.coin !== row.symbol ? row.coin : ""}
                    {row.walletCount > 1 ? ` · ${row.walletCount} wallets` : ""}
                  </span>
                </span>
                {prefs.columns.map((col) => (
                  <Cell key={col} col={col} row={row} tf={prefs.timeframe} usd={effUsd} factor={factor} />
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}

      <PrefsSheet open={sheet} onClose={() => setSheet(false)} prefs={prefs} onChange={update} canUsd={canUsd} />
    </div>
  );
}

function Cell({
  col,
  row,
  tf,
  usd,
  factor,
}: {
  col: CoinColumn;
  row: CoinRow;
  tf: Timeframe;
  usd: boolean;
  factor: number | null;
}) {
  const cur = usd ? "USD" : "ZAR";

  if (col === "price") {
    const price = usd ? row.priceUsd : row.priceZar;
    const change = row.change[tf];
    return (
      <span className="text-right">
        {price === null ? (
          <span className="text-sm text-faint">—</span>
        ) : (
          <Money value={price} currency={cur} variant="unit" className="block text-sm font-medium" />
        )}
        <span className="mt-0.5 block text-[12px]">
          {change === null ? (
            <span className="text-faint">—</span>
          ) : (
            <Percent value={change} signed />
          )}
        </span>
      </span>
    );
  }

  if (col === "holdings") {
    const value = usd && factor !== null ? row.valueZar * factor : row.valueZar;
    return (
      <span className="text-right">
        <Money value={value} currency={cur} variant="whole" className="block text-sm font-medium" />
        <span className="mt-0.5 block truncate text-[11px] text-faint">
          <Sensitive>{`${formatQuantity(row.quantity)} ${row.symbol}`}</Sensitive>
        </span>
      </span>
    );
  }

  if (col === "invested") {
    // Cost basis is recorded in rand — kept in rand in either currency mode
    // rather than converted at today's rate, which would misstate the cost.
    return (
      <span className="text-right">
        {row.investedZar > 0 ? (
          <Money value={row.investedZar} variant="whole" className="block text-sm font-medium" />
        ) : (
          <span className="text-sm text-faint">—</span>
        )}
      </span>
    );
  }

  // P&L stays in rand — the cost basis is recorded in rand, so a USD P&L would
  // be a guess. Honest over tidy (CLAUDE.md).
  const pct = pnlPctOf(row);
  return (
    <span className="text-right">
      {row.pnlZar === null ? (
        <span className="text-sm text-faint">—</span>
      ) : (
        <Money value={row.pnlZar} variant="whole" signed className="block text-sm font-medium" />
      )}
      <span className="mt-0.5 block text-[12px]">
        {pct === null ? <span className="text-faint">—</span> : <Percent value={pct} signed />}
      </span>
    </span>
  );
}

function PrefsSheet({
  open,
  onClose,
  prefs,
  onChange,
  canUsd,
}: {
  open: boolean;
  onClose: () => void;
  prefs: CoinsPrefs;
  onChange: (patch: Partial<CoinsPrefs>) => void;
  canUsd: boolean;
}) {
  function toggleColumn(col: CoinColumn) {
    const has = prefs.columns.includes(col);
    if (has) {
      if (prefs.columns.length === 1) return; // keep at least one
      onChange({ columns: prefs.columns.filter((c) => c !== col) });
    } else {
      // Newest choice replaces the oldest once two are picked — matches the
      // "select 2 columns" behaviour in the reference.
      const next = [...prefs.columns, col].slice(-2);
      onChange({ columns: next });
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title="Display preferences" description="How the coins list looks — saved on this device.">
      <Group label="Price % change timeframe">
        <div className="flex flex-wrap gap-1.5">
          {TIMEFRAMES.map((tf) => (
            <Chip key={tf} on={prefs.timeframe === tf} onClick={() => onChange({ timeframe: tf })}>
              {TF_LABEL[tf]}
            </Chip>
          ))}
          <span className="self-center text-[11px] text-faint">1H · 1Y coming soon</span>
        </div>
      </Group>

      <Group label="Columns" hint="Pick up to two.">
        <div className="flex flex-wrap gap-1.5">
          {ALL_COLUMNS.map((col) => (
            <Chip key={col.key} on={prefs.columns.includes(col.key)} onClick={() => toggleColumn(col.key)}>
              {col.label}
            </Chip>
          ))}
        </div>
      </Group>

      <Group label="Currency">
        <div className="flex flex-wrap gap-1.5">
          <Chip on={prefs.currency === "zar"} onClick={() => onChange({ currency: "zar" })}>
            ZAR
          </Chip>
          <Chip on={prefs.currency === "usd"} disabled={!canUsd} onClick={() => onChange({ currency: "usd" })}>
            USD
          </Chip>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          The currency switches price and holdings. Total P&amp;L stays in rand — your cost basis is
          recorded in rand, so a dollar P&amp;L would be a guess.
        </p>
      </Group>

      <Group label="Sort by">
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <Chip key={s.key} on={prefs.sort === s.key} onClick={() => onChange({ sort: s.key })}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Chip on={prefs.dir === "desc"} onClick={() => onChange({ dir: "desc" })}>
            High → low
          </Chip>
          <Chip on={prefs.dir === "asc"} onClick={() => onChange({ dir: "asc" })}>
            Low → high
          </Chip>
        </div>
      </Group>

      <label className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-4">
        <span>
          <span className="block text-sm">Show portfolio overview</span>
          <span className="mt-0.5 block text-[11px] text-faint">Value, 24h change and total P&amp;L on top.</span>
        </span>
        <input
          type="checkbox"
          checked={prefs.showOverview}
          onChange={(e) => onChange({ showOverview: e.target.checked })}
          className="h-5 w-5 shrink-0 cursor-pointer accent-accent"
        />
      </label>
    </SlideOver>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        {label}
        {hint ? <span className="ml-2 font-normal normal-case tracking-normal text-faint">{hint}</span> : null}
      </p>
      {children}
    </div>
  );
}

function Chip({
  on,
  disabled = false,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
        on
          ? "border-accent/50 bg-accent/15 text-ink"
          : "border-line text-muted hover:border-line-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
