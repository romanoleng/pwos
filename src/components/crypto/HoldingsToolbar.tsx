"use client";

import { ArrowUpDown, Download, Search, X } from "lucide-react";

import {
  EMPTY_FILTER,
  isFilterActive,
  type HoldingFilter,
  type SortDirection,
  type SortKey,
} from "@/lib/crypto/filter";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "value", label: "Value" },
  { key: "pnlPct", label: "Return %" },
  { key: "change24h", label: "24h" },
  { key: "weight", label: "Weight" },
  { key: "invested", label: "Invested" },
  { key: "symbol", label: "Symbol" },
];

export function HoldingsToolbar({
  filter,
  onFilterChange,
  sortKey,
  sortDirection,
  onSortChange,
  wallets,
  onExport,
  resultCount,
  totalCount,
}: {
  filter: HoldingFilter;
  onFilterChange: (next: HoldingFilter) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey, direction: SortDirection) => void;
  wallets: string[];
  onExport: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const active = isFilterActive(filter);

  function toggleWallet(wallet: string) {
    const wallets = filter.wallets.includes(wallet)
      ? filter.wallets.filter((w) => w !== wallet)
      : [...filter.wallets, wallet];
    onFilterChange({ ...filter, wallets });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={filter.query}
            onChange={(event) =>
              onFilterChange({ ...filter, query: event.target.value })
            }
            placeholder="Search coins…"
            aria-label="Search holdings"
            className="h-9 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
          />
        </div>

        <label className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5">
          <ArrowUpDown size={13} strokeWidth={1.75} className="text-faint" />
          <select
            value={sortKey}
            onChange={(event) => onSortChange(event.target.value as SortKey, sortDirection)}
            aria-label="Sort by"
            className="bg-transparent text-xs outline-none"
          >
            {SORTS.map((sort) => (
              <option key={sort.key} value={sort.key}>
                {sort.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onSortChange(sortKey, sortDirection === "asc" ? "desc" : "asc")}
            aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
            className="text-xs text-muted transition-colors hover:text-ink"
          >
            {sortDirection === "asc" ? "↑" : "↓"}
          </button>
        </label>

        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-muted transition-colors hover:border-line-2 hover:text-ink"
        >
          <Download size={13} strokeWidth={1.75} />
          Export
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Chip
          active={filter.core5Only}
          onClick={() => onFilterChange({ ...filter, core5Only: !filter.core5Only })}
        >
          Core 5
        </Chip>
        <Chip
          active={filter.performance === "profit"}
          onClick={() =>
            onFilterChange({
              ...filter,
              performance: filter.performance === "profit" ? null : "profit",
            })
          }
        >
          In profit
        </Chip>
        <Chip
          active={filter.performance === "loss"}
          onClick={() =>
            onFilterChange({
              ...filter,
              performance: filter.performance === "loss" ? null : "loss",
            })
          }
        >
          At a loss
        </Chip>
        <Chip
          active={filter.milestoneHitsOnly}
          onClick={() =>
            onFilterChange({ ...filter, milestoneHitsOnly: !filter.milestoneHitsOnly })
          }
        >
          Milestone hit
        </Chip>

        <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />

        {wallets.map((wallet) => (
          <Chip
            key={wallet}
            active={filter.wallets.includes(wallet)}
            onClick={() => toggleWallet(wallet)}
          >
            {wallet.replace("Tangem — ", "")}
          </Chip>
        ))}

        {active ? (
          <button
            type="button"
            onClick={() => onFilterChange(EMPTY_FILTER)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-ink"
          >
            <X size={11} strokeWidth={2} />
            Clear
          </button>
        ) : null}
      </div>

      {active ? (
        <p className="mt-2.5 border-t border-line pt-2.5 text-[11px] text-faint">
          Showing {resultCount} of {totalCount} positions. Export gives you exactly
          this set.
        </p>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-accent/50 bg-accent/15 text-ink"
          : "border-line text-muted hover:border-line-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
