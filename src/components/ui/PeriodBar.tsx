"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { PERIOD_OPTIONS, isPeriodKind, type PeriodKind } from "@/lib/period";

/**
 * The date range every screen is looking at (CLAUDE.md §9b).
 *
 * The choice lives in the URL rather than in component state, so it survives a
 * refresh, can be bookmarked, and stays put when navigating between screens
 * that both accept a period. It's also the only place the value can come from,
 * which means no screen can quietly disagree with another.
 */
export function usePeriodKind(fallback: PeriodKind = "cycle"): PeriodKind {
  const params = useSearchParams();
  const value = params.get("period");
  return isPeriodKind(value) ? value : fallback;
}

export function PeriodBar({
  /** Shown under the tabs — the resolved dates, so the range is never a guess. */
  hint,
}: {
  hint?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = usePeriodKind();

  const select = useCallback(
    (kind: PeriodKind) => {
      const next = new URLSearchParams(params.toString());
      // "cycle" is the default, so it stays out of the URL rather than
      // cluttering every link with a redundant parameter.
      if (kind === "cycle") next.delete("period");
      else next.set("period", kind);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="-mx-4 mb-4 border-b border-line bg-bg/95 px-4 pb-3 pt-1 backdrop-blur-md md:mx-0 md:rounded-xl md:border md:px-3 md:pt-3">
      <div
        role="tablist"
        aria-label="Date range"
        className="scrollbar-none flex gap-1 overflow-x-auto"
      >
        {PERIOD_OPTIONS.map((option) => {
          const selected = option.kind === active;
          return (
            <button
              key={option.kind}
              type="button"
              role="tab"
              aria-selected={selected}
              title={option.label}
              onClick={() => select(option.kind)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? "bg-accent text-white"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>
      {hint ? <p className="mt-2 px-0.5 text-[11px] text-faint">{hint}</p> : null}
    </div>
  );
}
