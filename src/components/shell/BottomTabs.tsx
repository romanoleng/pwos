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
 * The bar is solid purple with black icons — see the tab-bar commit for the
 * contrast maths. The middle three tabs are chosen in Settings; Home and More
 * are fixed, as the anchor and the escape hatch.
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
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-tabbar shadow-[0_-1px_12px_rgba(0,0,0,0.28)] md:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
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
