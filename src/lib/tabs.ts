"use client";

import {
  Banknote,
  Bitcoin,
  ChartColumn,
  CreditCard,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * The middle of the tab bar is Romano's to choose (his ask: "giving all these
 * tab options in settings for me to switch").
 *
 * Home and More are fixed — Home is the anchor and More is the escape hatch —
 * leaving three slots he sets in Settings. The choice lives in localStorage:
 * which tabs suit a thumb is a per-device question, and the phone and a
 * desktop browser can reasonably differ.
 */

export type TabOption = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const TAB_CHOICES: TabOption[] = [
  { href: "/budgets", label: "Budget", icon: Wallet },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/debt", label: "Debt", icon: CreditCard },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
  { href: "/accounts", label: "Accounts", icon: Banknote },
  { href: "/transactions", label: "Ledger", icon: Receipt },
  { href: "/stats", label: "Stats", icon: ChartColumn },
  { href: "/investments", label: "Invest", icon: TrendingUp },
];

/** The discipline set: what I may spend, what I'm building, what I owe. */
export const DEFAULT_TABS = ["/budgets", "/savings", "/debt"];

const KEY = "pwos-tabs";
const listeners = new Set<() => void>();

let cached: string[] | null = null;

function read(): string[] {
  if (cached === null) {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      const valid =
        Array.isArray(parsed) &&
        parsed.length === 3 &&
        parsed.every((h) => TAB_CHOICES.some((c) => c.href === h));
      cached = valid ? (parsed as string[]) : DEFAULT_TABS;
    } catch {
      cached = DEFAULT_TABS;
    }
  }
  return cached;
}

export function setChosenTabs(hrefs: string[]): void {
  // Exactly three, all known — anything else silently becomes the default,
  // and a malformed localStorage entry must never break the nav.
  const valid =
    hrefs.length === 3 && hrefs.every((h) => TAB_CHOICES.some((c) => c.href === h));
  cached = valid ? [...hrefs] : DEFAULT_TABS;
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Private browsing — in-memory still applies for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The three chosen middle tabs. Server snapshot is the default set. */
export function useChosenTabs(): string[] {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_TABS);
}
