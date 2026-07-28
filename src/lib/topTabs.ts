"use client";

import { Bitcoin, ChartColumn, ChartPie, Scale, TrendingUp, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Optional quick-access to the "big picture" screens (Romano's ask,
 * 2026-07-26), so the wealth views are one tap away while the bottom bar stays
 * the daily-driver set. Two placements, his choice per device:
 *   - "strip"  — a flat sticky row just under the header.
 *   - "header" — icon-only, inline beside the page title (no extra height).
 *   - "off"    — hidden (default).
 */

export type TopTabsMode = "off" | "strip" | "header";

export const TOP_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/wealth", label: "Wealth", icon: ChartPie },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
  { href: "/investments", label: "Invest", icon: TrendingUp },
  { href: "/net-worth", label: "Net worth", icon: Scale },
  { href: "/stats", label: "Stats", icon: ChartColumn },
];

const KEY = "pwos-toptabs";
const listeners = new Set<() => void>();

let cached: TopTabsMode | null = null;

function read(): TopTabsMode {
  if (cached === null) {
    try {
      const raw = localStorage.getItem(KEY);
      // "1" was the old on/off flag (always the strip); map it forward.
      cached = raw === "1" || raw === "strip" ? "strip" : raw === "header" ? "header" : "off";
    } catch {
      cached = "off";
    }
  }
  return cached;
}

export function setTopTabsMode(next: TopTabsMode): void {
  cached = next;
  try {
    if (next === "off") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* private browsing — in-memory only */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTopTabsMode(): TopTabsMode {
  return useSyncExternalStore(subscribe, read, () => "off");
}
