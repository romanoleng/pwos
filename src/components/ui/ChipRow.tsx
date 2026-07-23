"use client";

import type { ReactNode } from "react";

/**
 * One-tap chips under a picker (Romano's ask, 2026-07-23).
 *
 * A single row that scrolls sideways — never wraps, because vertical space on
 * the log sheet is at a premium. The picker underneath stays the fallback for
 * anything not in the chips.
 */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar -mx-0.5 mt-1.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5">
      {children}
    </div>
  );
}

export function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-accent/50 bg-accent/15 text-ink"
          : "border-line text-muted hover:border-line-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
