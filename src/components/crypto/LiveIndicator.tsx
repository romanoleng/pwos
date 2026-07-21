"use client";

import { useEffect, useState } from "react";

import { formatRelativeAge } from "@/lib/format";

/**
 * "live · updated 12s ago" (CLAUDE.md §5).
 *
 * Ticks on its own so the age stays truthful between the 60s data polls —
 * otherwise it would read "0s ago" for a full minute.
 */
export function LiveIndicator({
  fetchedAt,
  staleReason,
  isValidating,
}: {
  fetchedAt: number;
  staleReason: string | null;
  isValidating: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const stale = staleReason !== null;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-faint"
      title={staleReason ?? undefined}
    >
      <span
        aria-hidden
        className={`inline-block size-1.5 rounded-full ${
          stale ? "bg-warn" : "bg-gain"
        } ${isValidating && !stale ? "animate-pulse" : ""}`}
      />
      {stale ? "stale" : "live"} · updated {formatRelativeAge(fetchedAt, now)}
    </span>
  );
}
