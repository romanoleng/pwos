"use client";

import { useSyncExternalStore } from "react";

/**
 * Where the mobile tab bar lives — bottom (default) or top, chosen in
 * Settings → Navigation.
 *
 * Same architecture as the theme (components/theme.tsx): a pre-paint script
 * stamps `data-nav` on <html>, CSS in globals.css positions the bar and pads
 * the scroll container off that attribute, and components read the attribute
 * through useSyncExternalStore. The attribute is the single source of truth,
 * so the bar, the FAB and the main padding can never disagree — and because
 * it's set before first paint, switching devices never shows the bar jumping
 * from one edge to the other.
 *
 * Per-device on purpose, like the tab choice: localStorage, not the database.
 * The floating + button stays bottom-right in both modes — reachability is a
 * thumb question, not a navigation question.
 */

export type NavPosition = "bottom" | "top";

const STORAGE_KEY = "pwos-nav";

/** Runs in <head> before paint — mirrors THEME_INIT_SCRIPT. */
export const NAV_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});document.documentElement.setAttribute("data-nav",v==="top"?"top":"bottom")}catch(e){document.documentElement.setAttribute("data-nav","bottom")}})()`;

function isNavPosition(value: string | null): value is NavPosition {
  return value === "bottom" || value === "top";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-nav"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): NavPosition {
  const attr = document.documentElement.getAttribute("data-nav");
  return isNavPosition(attr) ? attr : "bottom";
}

function getServerSnapshot(): NavPosition {
  return "bottom";
}

export function applyNavPosition(position: NavPosition): void {
  document.documentElement.setAttribute("data-nav", position);
  try {
    localStorage.setItem(STORAGE_KEY, position);
  } catch {
    // Private mode — still applies for this session.
  }
}

export function useNavPosition(): NavPosition {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
