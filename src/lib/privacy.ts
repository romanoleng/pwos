"use client";

import { useSyncExternalStore } from "react";

/**
 * Privacy mode (Romano's ask: "showcase to someone but not show values").
 *
 * One switch hides every rand amount, coin symbol, quantity and holding name,
 * while percentages stay visible — the shape of the money without the
 * substance. Hiding is instant; revealing asks for the app password, so
 * handing the phone over doesn't hand over the numbers.
 *
 * The state persists in localStorage: if the phone reloads mid-showcase, the
 * values must come back hidden, not exposed.
 *
 * This is a display mask, not encryption — the data is still in the API
 * responses underneath. It defends against shoulders, not forensics.
 */

const KEY = "pwos-privacy-hidden";
const listeners = new Set<() => void>();

let hidden: boolean | null = null;

function read(): boolean {
  if (hidden === null) {
    try {
      hidden = localStorage.getItem(KEY) === "1";
    } catch {
      hidden = false;
    }
  }
  return hidden;
}

export function setValuesHidden(next: boolean): void {
  hidden = next;
  try {
    if (next) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Private browsing — the in-memory value still works for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether values are currently masked.
 *
 * The server snapshot is `false`: money screens fetch their data client-side,
 * so nothing sensitive exists at hydration time and the mask settles before
 * any figure renders.
 */
export function useValuesHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
