"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "pwos-theme";

/**
 * Runs before first paint to stamp `data-theme` on <html>. Without this the
 * page paints dark-by-default then snaps to light — a white flash on every
 * cold load, which is exactly the tell of a cheap web app.
 *
 * Dark is the default (§6 is dark-first), so an unset preference stays dark
 * even if the OS is light.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`;

/**
 * The <html> attribute is the single source of truth, read via
 * useSyncExternalStore rather than mirrored into component state. That keeps
 * every toggle on the page (sidebar and mobile header both render one) in sync
 * automatically, and avoids a setState-in-effect cascade.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

/** The server can't know the stored preference; dark is the documented default. */
function getServerSnapshot(): Theme {
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / storage disabled — the theme still applies for this session.
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next: Theme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`inline-flex size-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-2 hover:text-ink ${className}`}
    >
      {theme === "light" ? (
        <Moon size={16} strokeWidth={1.75} />
      ) : (
        <Sun size={16} strokeWidth={1.75} />
      )}
    </button>
  );
}
