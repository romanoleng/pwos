"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A thin top progress bar so a tap always shows something is happening
 * (Romano's ask, 2026-07-29 — "when I click somewhere I never know it's going").
 *
 * Next 16's `useLinkStatus` only reports the pending state of one specific
 * <Link>; this needs to fire for a tap *anywhere* — a nav tab, a card, a list
 * row. So instead of per-link status we listen for internal-link clicks at the
 * document level (capture phase), trickle a bar toward 90%, and snap it to 100%
 * when the pathname commits. A short show-delay means instant/prefetched
 * navigations don't flash the bar at all.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const loadingRef = useRef(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const showDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (trickle.current) { clearInterval(trickle.current); trickle.current = null; }
    if (showDelay.current) { clearTimeout(showDelay.current); showDelay.current = null; }
    if (safety.current) { clearTimeout(safety.current); safety.current = null; }
  }, []);

  const finish = useCallback(() => {
    if (!loadingRef.current) return;
    loadingRef.current = false;
    clearTimers();
    setProgress(100);
    // Let the 100% frame paint, then fade out and reset.
    window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 240);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    // Hold off ~120ms: a prefetched route commits before this fires, so a fast
    // hop never even shows the bar.
    showDelay.current = setTimeout(() => {
      setVisible(true);
      setProgress(8);
      trickle.current = setInterval(() => {
        // Ease toward 90% and stall there until the route commits.
        setProgress((p) => (p < 90 ? p + Math.max(0.5, (90 - p) * 0.08) : p));
      }, 220);
    }, 120);
    // Never leave the bar stuck if a navigation is cancelled or goes nowhere.
    safety.current = setTimeout(finish, 8000);
  }, [finish]);

  // Start the bar on any left-click of an in-app link (renders as an <a>).
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same place → no navigation, so no bar.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // Route committed → complete the bar. No-ops on first mount (nothing loading).
  useEffect(() => {
    finish();
  }, [pathname, finish]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!visible && progress === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className="h-full bg-accent transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          boxShadow: "0 0 8px var(--accent), 0 0 4px var(--accent)",
        }}
      />
    </div>
  );
}
