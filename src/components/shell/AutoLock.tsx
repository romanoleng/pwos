"use client";

import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { signOut } from "@/app/actions/auth";
import { confirmReveal } from "@/app/actions/privacy";
import { useAutoLock } from "@/lib/autolock";
import { setValuesHidden } from "@/lib/privacy";

/**
 * Watches for inactivity and, after the chosen time, protects the app (see
 * lib/autolock.ts). Mounted once in the authenticated shell.
 *
 * Timers are throttled or suspended while a tab is backgrounded, so we don't
 * trust them alone: activity stamps a timestamp, and the elapsed time is
 * re-checked both on an interval AND whenever the tab becomes visible again —
 * so a phone left locked for an hour is locked the instant it's reopened.
 */
export function AutoLock() {
  const { minutes, mode } = useAutoLock();
  const [locked, setLocked] = useState(false);
  const lastActive = useRef(Date.now());

  useEffect(() => {
    if (minutes <= 0) {
      setLocked(false);
      return;
    }
    const idleMs = minutes * 60_000;

    function trigger() {
      if (mode === "hide") {
        setValuesHidden(true);
      } else if (mode === "lock") {
        setValuesHidden(true);
        setLocked(true);
      } else {
        void signOut();
      }
    }

    function bump() {
      lastActive.current = Date.now();
    }

    function check() {
      if (locked) return;
      if (Date.now() - lastActive.current >= idleMs) trigger();
    }

    // Passive so scrolling stays smooth; these just refresh the timestamp.
    const events = ["pointerdown", "keydown", "touchstart", "scroll", "mousemove"] as const;
    for (const e of events) window.addEventListener(e, bump, { passive: true });

    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);

    const id = window.setInterval(check, 10_000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [minutes, mode, locked]);

  if (!locked) return null;

  return (
    <LockScreen
      onUnlock={() => {
        lastActive.current = Date.now();
        setValuesHidden(false);
        setLocked(false);
      }}
    />
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setChecking(true);
    setError(null);
    const result = await confirmReveal(String(formData.get("password") ?? ""));
    setChecking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onUnlock();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/95 px-6 backdrop-blur-xl">
      <div className="w-full max-w-[21rem] text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Lock size={24} strokeWidth={1.9} />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Locked</h1>
        <p className="mx-auto mt-1.5 max-w-[26ch] text-sm text-muted">
          You&apos;ve been away — enter your password to carry on.
        </p>

        <form action={onSubmit} className="mt-6 text-left">
          <label htmlFor="lock-password" className="block text-xs font-medium text-muted">
            Password
          </label>
          <input
            id="lock-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
            placeholder="••••••••"
          />
          {error ? <p className="mt-2 text-xs text-loss">{error}</p> : null}
          <button
            type="submit"
            disabled={checking}
            className="mt-4 h-10 w-full rounded-lg bg-accent text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {checking ? "Checking…" : "Unlock"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 text-[11px] text-faint transition-colors hover:text-muted"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
