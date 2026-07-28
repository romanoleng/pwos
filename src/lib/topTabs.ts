"use client";

import {
  Banknote,
  Bitcoin,
  BookOpen,
  Briefcase,
  ChartColumn,
  ChartPie,
  CreditCard,
  PiggyBank,
  Receipt,
  Scale,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Optional quick-access to more screens (Romano's ask, 2026-07-26; made
 * choosable 2026-07-27), so favourites are one tap away while the bottom bar
 * stays the daily-driver set. Two things, both per device:
 *   - placement: "off" | "strip" (flat row under the header) | "header"
 *     (icon-only beside the title).
 *   - which screens: up to five, picked from the pool below.
 */

export type TopTabsMode = "off" | "strip" | "header";

export type TopChoice = { href: string; label: string; icon: LucideIcon };

/** The pool Romano picks the quick-access buttons from. */
export const TOP_CHOICES: TopChoice[] = [
  { href: "/wealth", label: "Wealth", icon: ChartPie },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
  { href: "/investments", label: "Invest", icon: TrendingUp },
  { href: "/net-worth", label: "Net worth", icon: Scale },
  { href: "/stats", label: "Stats", icon: ChartColumn },
  { href: "/accounts", label: "Accounts", icon: Banknote },
  { href: "/transactions", label: "Ledger", icon: Receipt },
  { href: "/budgets", label: "Budget", icon: Wallet },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/debt", label: "Debt", icon: CreditCard },
  { href: "/businesses", label: "Business", icon: Briefcase },
  { href: "/guide", label: "Guide", icon: BookOpen },
];

export const MAX_TOP_LINKS = 5;
const DEFAULT_LINKS = ["/wealth", "/crypto", "/investments", "/net-worth", "/stats"];

const MODE_KEY = "pwos-toptabs";
const LINKS_KEY = "pwos-toptabs-links";
const listeners = new Set<() => void>();

let cachedMode: TopTabsMode | null = null;
let cachedLinks: string[] | null = null;

function readMode(): TopTabsMode {
  if (cachedMode === null) {
    try {
      const raw = localStorage.getItem(MODE_KEY);
      // "1" was the old on/off flag (always the strip); map it forward.
      cachedMode = raw === "1" || raw === "strip" ? "strip" : raw === "header" ? "header" : "off";
    } catch {
      cachedMode = "off";
    }
  }
  return cachedMode;
}

function readLinks(): string[] {
  if (cachedLinks === null) {
    try {
      const raw = localStorage.getItem(LINKS_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      const valid =
        Array.isArray(parsed) &&
        parsed.every((h) => typeof h === "string" && TOP_CHOICES.some((c) => c.href === h));
      cachedLinks = valid && parsed.length > 0 ? (parsed as string[]).slice(0, MAX_TOP_LINKS) : DEFAULT_LINKS;
    } catch {
      cachedLinks = DEFAULT_LINKS;
    }
  }
  return cachedLinks;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function setTopTabsMode(next: TopTabsMode): void {
  cachedMode = next;
  try {
    if (next === "off") localStorage.removeItem(MODE_KEY);
    else localStorage.setItem(MODE_KEY, next);
  } catch {
    /* private browsing — in-memory only */
  }
  emit();
}

export function setTopLinks(hrefs: string[]): void {
  const valid = hrefs.filter((h) => TOP_CHOICES.some((c) => c.href === h)).slice(0, MAX_TOP_LINKS);
  cachedLinks = valid.length > 0 ? valid : DEFAULT_LINKS;
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(cachedLinks));
  } catch {
    /* private browsing — in-memory only */
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTopTabsMode(): TopTabsMode {
  return useSyncExternalStore(subscribe, readMode, () => "off");
}

/** The chosen hrefs (for the picker). */
export function useTopLinkHrefs(): string[] {
  return useSyncExternalStore(subscribe, readLinks, () => DEFAULT_LINKS);
}

/** The chosen links resolved to their icon + label, in order. */
export function resolveTopLinks(hrefs: string[]): TopChoice[] {
  return hrefs
    .map((h) => TOP_CHOICES.find((c) => c.href === h))
    .filter((c): c is TopChoice => c !== undefined);
}
