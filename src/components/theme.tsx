"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "emerald" | "ember" | "ultraviolet";

/**
 * The five themes. Each is a full token set in globals.css keyed on
 * [data-theme=…] — nothing here holds a colour, so a theme is tuned in
 * exactly one place.
 *
 * `appearance` groups them into dark and light families for the quick
 * toggle: sun/moon means "flip polarity", not "walk a 5-item cycle".
 */
export const THEMES: {
  id: Theme;
  name: string;
  hint: string;
  appearance: "dark" | "light";
}[] = [
  { id: "dark", name: "Dark", hint: "The default. Neutral greys.", appearance: "dark" },
  { id: "light", name: "Light", hint: "Cool white.", appearance: "light" },
  { id: "emerald", name: "Emerald", hint: "Terminal green on deep forest.", appearance: "dark" },
  { id: "ember", name: "Ember", hint: "Molten coral on warm charcoal.", appearance: "dark" },
  { id: "ultraviolet", name: "Ultraviolet", hint: "Synthwave — fuchsia on violet.", appearance: "dark" },
];

const STORAGE_KEY = "pwos-theme";
const THEME_IDS = THEMES.map((t) => t.id);

/**
 * Runs before first paint to stamp `data-theme` on <html>. Without this the
 * page paints dark-by-default then snaps to the stored theme — a flash on
 * every cold load, which is exactly the tell of a cheap web app.
 *
 * Dark is the default (§6 is dark-first), so an unset or unrecognised
 * preference stays dark even if the OS is light. The valid list is inlined
 * because this string executes before any module loads.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var v=${JSON.stringify(
  THEME_IDS,
)};var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});document.documentElement.setAttribute("data-theme",v.indexOf(t)>=0?t:"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`;

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEME_IDS as string[]).includes(value);
}

export function appearanceOf(theme: Theme): "dark" | "light" {
  return THEMES.find((t) => t.id === theme)?.appearance ?? "dark";
}

/**
 * The <html> attribute is the single source of truth, read via
 * useSyncExternalStore rather than mirrored into component state. That keeps
 * every control on the page (sidebar toggle and the Settings picker) in sync
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
  const attr = document.documentElement.getAttribute("data-theme");
  return isTheme(attr) ? attr : "dark";
}

/** The server can't know the stored preference; dark is the documented default. */
function getServerSnapshot(): Theme {
  return "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    // Remember the last choice per family, so the sun/moon toggle returns to
    // *your* dark (say, Midnight) rather than resetting to the default.
    localStorage.setItem(`${STORAGE_KEY}:${appearanceOf(theme)}`, theme);
  } catch {
    // Private mode / storage disabled — the theme still applies for this session.
  }
}

/**
 * The quick toggle (sidebar). With five themes it flips *polarity*: from any
 * dark-family theme to the last light-family one you used, and back. The
 * full choice lives in Settings → Appearance.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const target = appearanceOf(theme) === "dark" ? "light" : "dark";

  const flip = () => {
    let next: Theme = target; // family defaults: "dark" and "light" themselves
    try {
      const remembered = localStorage.getItem(`${STORAGE_KEY}:${target}`);
      if (isTheme(remembered) && appearanceOf(remembered) === target) {
        next = remembered;
      }
    } catch {
      // Fall through to the family default.
    }
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to a ${target} theme`}
      title={`Switch to a ${target} theme`}
      className={`inline-flex size-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-2 hover:text-ink ${className}`}
    >
      {appearanceOf(theme) === "light" ? (
        <Moon size={16} strokeWidth={1.75} />
      ) : (
        <Sun size={16} strokeWidth={1.75} />
      )}
    </button>
  );
}

/**
 * The full picker (Settings → Appearance). Each swatch sets data-theme on
 * itself, so it renders with that theme's actual tokens — the preview can
 * never drift from the real thing, because it *is* the real thing.
 */
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
    >
      {THEMES.map((entry) => {
        const active = theme === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => applyTheme(entry.id)}
            className={`rounded-xl border p-2.5 text-left transition-colors ${
              active ? "border-accent" : "border-line hover:border-line-2"
            }`}
          >
            <span
              data-theme={entry.id}
              aria-hidden
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-bg"
            >
              <span className="h-5 w-7 rounded border border-line bg-surface" />
              <span className="size-2.5 rounded-full bg-accent" />
              <span className="h-5 w-3.5 rounded bg-raise" />
            </span>
            <span className="mt-2 block text-xs font-medium">{entry.name}</span>
            <span className="mt-0.5 block text-[10px] leading-tight text-faint">
              {entry.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
