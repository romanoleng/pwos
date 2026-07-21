"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS, isActivePath } from "@/lib/nav";
import { ThemeToggle } from "@/components/theme";
import { SignOutButton } from "@/components/shell/SignOutButton";

/** Desktop navigation (≥ md). Hidden entirely on mobile, where tabs take over. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <span className="grid size-7 place-items-center rounded-md bg-accent/15 text-[11px] font-semibold tracking-tight text-accent">
          P
        </span>
        <span className="text-sm font-semibold tracking-tight">PWOS</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-5">
            <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                        active
                          ? "bg-raise text-ink"
                          : "text-muted hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      <Icon
                        size={16}
                        strokeWidth={1.75}
                        className={active ? "text-accent" : "text-faint"}
                      />
                      {item.longLabel ?? item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-3 py-3">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </aside>
  );
}
