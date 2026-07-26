"use client";

import { useSyncExternalStore } from "react";

/**
 * Auto-lock on idle (Romano's ask, 2026-07-26): step away and, after a chosen
 * time, the app protects itself — hide the numbers, lock behind the password,
 * or sign out entirely.
 *
 * The choice is per-device (localStorage), because "lock my phone after 5 min"
 * and "never lock my home desktop" are reasonably different answers. Default is
 * OFF so the app never surprises anyone by locking them out of their own data;
 * turning it on is one tap in Settings.
 */

export type LockMode = "hide" | "lock" | "signout";

export type AutoLockPrefs = {
  /** Minutes of inactivity before locking. 0 = off. */
  minutes: number;
  mode: LockMode;
};

export const LOCK_MINUTES = [0, 1, 5, 15, 30] as const;

const KEY = "pwos-autolock";
const DEFAULT: AutoLockPrefs = { minutes: 0, mode: "lock" };
const listeners = new Set<() => void>();

let cached: AutoLockPrefs | null = null;

function read(): AutoLockPrefs {
  if (cached === null) {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<AutoLockPrefs>) : null;
      const minutes = LOCK_MINUTES.includes(parsed?.minutes as (typeof LOCK_MINUTES)[number])
        ? (parsed!.minutes as number)
        : 0;
      const mode: LockMode =
        parsed?.mode === "hide" || parsed?.mode === "lock" || parsed?.mode === "signout"
          ? parsed.mode
          : "lock";
      cached = { minutes, mode };
    } catch {
      cached = DEFAULT;
    }
  }
  return cached;
}

export function setAutoLock(next: AutoLockPrefs): void {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private browsing — in-memory only */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAutoLock(): AutoLockPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}
