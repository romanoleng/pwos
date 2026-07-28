"use client";

import { Bitcoin, ChartColumn, ChartPie, Scale, TrendingUp, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Optional quick-access top bar (Romano's ask, 2026-07-26): a second, flatter
 * strip under the header with the "big picture" screens, so the wealth views
 * are one tap away while the bottom bar stays the daily-driver set.
 *
 * Fixed set for now (a curated overview cluster); off by default and toggled
 * per device in Settings → Navigation.
 */

export const TOP_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/wealth", label: "Wealth", icon: ChartPie },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
  { href: "/investments", label: "Invest", icon: TrendingUp },
  { href: "/net-worth", label: "Net worth", icon: Scale },
  { href: "/stats", label: "Stats", icon: ChartColumn },
];

const KEY = "pwos-toptabs";
const listeners = new Set<() => void>();

let cached: boolean | null = null;

function read(): boolean {
  if (cached === null) {
    try {
      cached = localStorage.getItem(KEY) === "1";
    } catch {
      cached = false;
    }
  }
  return cached;
}

export function setTopTabsEnabled(next: boolean): void {
  cached = next;
  try {
    if (next) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private browsing — in-memory only */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTopTabsEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
