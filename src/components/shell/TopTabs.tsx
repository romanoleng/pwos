"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath } from "@/lib/nav";
import { TOP_LINKS, useTopTabsEnabled } from "@/lib/topTabs";

/**
 * The optional quick-access top bar (see lib/topTabs.ts). Flatter than the
 * bottom tabs — a thin, horizontal icon+label row — and sticky just below the
 * header so the wealth screens stay reachable as you scroll. Mobile only; the
 * `top-tabs` sticky offset and its data-nav handling live in globals.css.
 */
export function TopTabs() {
  const enabled = useTopTabsEnabled();
  const pathname = usePathname();
  if (!enabled) return null;

  return (
    <nav className="top-tabs z-[19] border-b border-line bg-bg/90 backdrop-blur-md md:hidden">
      <ul className="grid grid-cols-5 divide-x divide-line/60">
        {TOP_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-center gap-1.5 px-1 py-1.5 text-[10.5px] transition-colors ${
                  active ? "font-semibold text-accent" : "font-medium text-muted"
                }`}
              >
                <Icon size={13} strokeWidth={active ? 2.25 : 1.75} className="shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
