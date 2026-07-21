"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TAB_ITEMS, isActivePath } from "@/lib/nav";

/**
 * Mobile navigation (< md). Fixed to the bottom, inside the safe area so it
 * clears the iPhone home indicator when installed as a PWA.
 */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
      <ul className="grid grid-cols-5">
        {TAB_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
                  active ? "text-accent" : "text-faint"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2 : 1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
