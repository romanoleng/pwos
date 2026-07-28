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

import { useChosenTabs } from "./tabs";

/**
 * Optional quick-access to more screens (Romano's ask, 2026-07-26; made
 * choosable and dual-placement 2026-07-27). Two INDEPENDENT placements —
 * a flat strip below the header and icons in the header — each with its own
 * on/off and its own chosen buttons, so both can run at once with different
 * screens in each. Everything is per device.
 */

export type TopPlacement = "strip" | "header";

export type TopChoice = { href: string; label: string; icon: LucideIcon };

/** The pool the quick-access buttons are picked from — screens from the Menu. */
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
// Different defaults per placement, so enabling both doesn't start with the
// same screens in each (they'd collide).
const DEFAULTS: Record<TopPlacement, string[]> = {
  strip: ["/wealth", "/crypto", "/investments", "/net-worth", "/stats"],
  header: ["/accounts", "/transactions", "/businesses"],
};

const listeners = new Set<() => void>();
const enabledCache: Record<TopPlacement, boolean | null> = { strip: null, header: null };
const linksCache: Record<TopPlacement, string[] | null> = { strip: null, header: null };

const enabledKey = (p: TopPlacement) => `pwos-top-${p}`;
const linksKey = (p: TopPlacement) => `pwos-top-${p}-links`;

function readEnabled(p: TopPlacement): boolean {
  if (enabledCache[p] === null) {
    try {
      enabledCache[p] = localStorage.getItem(enabledKey(p)) === "1";
    } catch {
      enabledCache[p] = false;
    }
  }
  return enabledCache[p] as boolean;
}

function readLinks(p: TopPlacement): string[] {
  if (linksCache[p] === null) {
    try {
      const raw = localStorage.getItem(linksKey(p));
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      const valid =
        Array.isArray(parsed) &&
        parsed.every((h) => typeof h === "string" && TOP_CHOICES.some((c) => c.href === h));
      linksCache[p] = valid && parsed.length > 0 ? (parsed as string[]).slice(0, MAX_TOP_LINKS) : DEFAULTS[p];
    } catch {
      linksCache[p] = DEFAULTS[p];
    }
  }
  return linksCache[p] as string[];
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function setTopEnabled(p: TopPlacement, on: boolean): void {
  enabledCache[p] = on;
  try {
    if (on) localStorage.setItem(enabledKey(p), "1");
    else localStorage.removeItem(enabledKey(p));
  } catch {
    /* private browsing — in-memory only */
  }
  emit();
}

export function setTopLinks(p: TopPlacement, hrefs: string[]): void {
  const valid = hrefs.filter((h) => TOP_CHOICES.some((c) => c.href === h)).slice(0, MAX_TOP_LINKS);
  linksCache[p] = valid.length > 0 ? valid : DEFAULTS[p];
  try {
    localStorage.setItem(linksKey(p), JSON.stringify(linksCache[p]));
  } catch {
    /* private browsing — in-memory only */
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTopEnabled(p: TopPlacement): boolean {
  return useSyncExternalStore(subscribe, () => readEnabled(p), () => false);
}

export function useTopLinkHrefs(p: TopPlacement): string[] {
  return useSyncExternalStore(subscribe, () => readLinks(p), () => DEFAULTS[p]);
}

/** The chosen links resolved to their icon + label, in order. */
export function resolveTopLinks(hrefs: string[]): TopChoice[] {
  return hrefs
    .map((h) => TOP_CHOICES.find((c) => c.href === h))
    .filter((c): c is TopChoice => c !== undefined);
}

/**
 * What a placement should ACTUALLY show, deduped across the bars so a screen
 * never appears in two of them at once (Romano's ask, 2026-07-27). Priority:
 * the bottom bar wins, then the strip, then the header — a link claimed by a
 * higher-priority bar is dropped from the lower one. This is a render-time
 * guard, so even legacy overlapping choices resolve cleanly.
 */
export function useResolvedTopLinks(placement: TopPlacement): TopChoice[] {
  const stripOn = useTopEnabled("strip");
  const stripHrefs = useTopLinkHrefs("strip");
  const headerHrefs = useTopLinkHrefs("header");
  const bottom = useChosenTabs();

  const bottomSet = new Set(bottom);
  const stripResolved = stripHrefs.filter((h) => !bottomSet.has(h));
  if (placement === "strip") return resolveTopLinks(stripResolved);

  const claimed = new Set([...bottom, ...(stripOn ? stripResolved : [])]);
  return resolveTopLinks(headerHrefs.filter((h) => !claimed.has(h)));
}
