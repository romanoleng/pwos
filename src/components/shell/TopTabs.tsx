"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath } from "@/lib/nav";
import { resolveTopLinks, useTopLinkHrefs, useTopTabsMode } from "@/lib/topTabs";

/**
 * The optional quick-access strip (see lib/topTabs.ts). Flatter than the bottom
 * tabs — a thin, horizontal icon+label row — sticky just below the header so
 * the chosen screens stay reachable as you scroll. Only renders in "strip"
 * placement; "header" renders inline in TopBar instead. Mobile only; the
 * `top-tabs` sticky offset lives in globals.css.
 */
export function TopTabs() {
  const mode = useTopTabsMode();
  const links = resolveTopLinks(useTopLinkHrefs());
  const pathname = usePathname();
  if (mode !== "strip" || links.length === 0) return null;

  return (
    <nav className="top-tabs z-[19] border-b border-line bg-bg/90 backdrop-blur-md md:hidden">
      <ul className="flex divide-x divide-line/60">
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href} className="flex-1">
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
