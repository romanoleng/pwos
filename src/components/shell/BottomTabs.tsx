"use client";

import { Home, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath } from "@/lib/nav";
import { TAB_CHOICES, useChosenTabs } from "@/lib/tabs";

/**
 * Mobile navigation (< md). Docked to the bottom by default, or to the top —
 * directly beneath the header — when Settings → Navigation says so. All
 * positioning (edge, safe-area padding, which side gets the hairline) lives
 * in globals.css keyed on the `data-nav` attribute, so the bar, the FAB and
 * the scroll padding move together and never disagree.
 *
 * Reverted 2026-07-23 (Romano's ask): the bar itself stays dark — no solid
 * accent fill, no inverted active cell. Only the active icon and label carry
 * the accent; everything else is quiet. The middle three tabs are chosen in
 * Settings; Home and More are fixed, as the anchor and the escape hatch.
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
    <nav className="tab-nav z-30 bg-bg/95 backdrop-blur-md md:hidden">
      {/* Hairline dividers keep each of the five buttons on its own ground
          without the bar itself needing a fill. */}
      <ul className="grid grid-cols-5 divide-x divide-line">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[10px] transition-transform active:scale-95 ${
                  active ? "font-semibold text-accent" : "font-medium text-muted"
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
