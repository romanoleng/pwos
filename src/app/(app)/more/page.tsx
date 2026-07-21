import type { Metadata } from "next";
import Link from "next/link";

import { NAV_GROUPS } from "@/lib/nav";
import { PageHeader } from "@/components/ui/Card";
import { SignOutButton } from "@/components/shell/SignOutButton";

export const metadata: Metadata = { title: "More" };

/**
 * Mobile overflow for everything that doesn't earn a tab. Desktop users reach
 * these from the sidebar, so this page is effectively mobile-only in practice.
 */
export default function MorePage() {
  return (
    <>
      <PageHeader title="More" description="Everything else." />

      <div className="space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-1 pb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
              {group.title}
            </p>
            <ul className="overflow-hidden rounded-xl border border-line bg-surface">
              {group.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-2 ${
                        index > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <Icon size={16} strokeWidth={1.75} className="text-faint" />
                      {item.longLabel ?? item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <SignOutButton />
        <span className="text-xs text-muted">Sign out</span>
      </div>
    </>
  );
}
