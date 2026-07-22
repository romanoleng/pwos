"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TAB_ITEMS, isActivePath } from "@/lib/nav";

/**
 * Mobile navigation (< md). Fixed to the bottom, inside the safe area so it
 * clears the iPhone home indicator when installed as a PWA.
 *
 * The bar is solid purple with black icons. It used to be bg-surface, which in
 * dark mode sits a shade off the page background and simply disappeared.
 *
 * The purple is pinned rather than taken from --accent. Black on this lighter
 * purple is 6,81:1, comfortably past AA for the 10px labels — but on the light
 * theme's darker accent it falls to 3,82:1 and fails. One fixed colour keeps
 * the contrast honest in both themes and makes the bar a constant anchor
 * instead of something that restyles under you.
 *
 * Colour can no longer signal the active tab, since the whole bar is now the
 * accent. Active is solid black on a translucent pill; inactive is the dimmed
 * indigo, measured at 4,55:1 rather than eyeballed.
 */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-tabbar shadow-[0_-1px_12px_rgba(0,0,0,0.28)] md:hidden">
      <ul className="grid grid-cols-5">
        {TAB_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors ${
                  active ? "text-tabbar-ink" : "text-tabbar-dim"
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-black/15" : ""
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
