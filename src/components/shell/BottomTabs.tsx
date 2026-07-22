"use client";

import { Home, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath } from "@/lib/nav";
import { TAB_CHOICES, useChosenTabs } from "@/lib/tabs";

/**
 * Mobile navigation (< md). Fixed to the bottom, inside the safe area so it
 * clears the iPhone home indicator when installed as a PWA.
 *
 * The bar is a solid accent colour with black icons — purple in Dark/Light,
 * the theme's accent in the colour themes; every accent used keeps the
 * black-icon contrast from the tab-bar commit's maths. The middle three tabs
 * are chosen in Settings; Home and More are fixed, as the anchor and the
 * escape hatch.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const chosen = useChosenTabs();

  const items = [
    { href: "/", label: "Home", icon: Home },
    ...chosen
      .map((href) => TAB_CHOICES.find((c) => c.href === href))
      .filter((c): c is NonNullable<typeof c> => c !== undefined),
    { href: "/more", label: "More", icon: MoreHorizontal },
  ];

  return (
    // The hairlines are black at low alpha, like the active pill, so they
    // hold on every theme's accent without a per-theme token: a top hairline
    // seats the bar against the content, and dividers give each of the five
    // buttons its own ground instead of five labels floating on one colour.
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-black/20 bg-tabbar shadow-[0_-1px_12px_rgba(0,0,0,0.28)] md:hidden">
      <ul className="grid grid-cols-5 divide-x divide-black/10">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              {/* The active tab INVERTS: black cell, the bar's own colour as
                  ink (Romano's ask, 2026-07-22). Unmissable in the corner of
                  an eye, and it works on every theme's accent because the
                  ink is the accent. */}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[10px] transition-transform active:scale-95 ${
                  active
                    ? "bg-black/85 font-semibold text-tabbar"
                    : "font-medium text-tabbar-dim"
                }`}
              >
                <span className="flex h-7 w-13 items-center justify-center">
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
