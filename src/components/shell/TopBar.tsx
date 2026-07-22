"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { PrivacyToggle } from "@/components/shell/PrivacyToggle";
import { navTitleFor } from "@/lib/nav";

/**
 * Mobile-only header. Desktop gets its identity from the sidebar, so repeating
 * a title bar there would just be chrome for chrome's sake.
 */
export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md md:hidden">
      <div className="flex h-12 items-center justify-between px-4">
        <h1 className="text-sm font-semibold tracking-tight">{navTitleFor(pathname)}</h1>
        <div className="flex items-center gap-0.5">
        <PrivacyToggle />
        {/* One slot, one meaning, every screen. The theme toggle used to live
            here — a set-once preference in the only permanently visible spot.
            It's in Settings now. The middle stays empty for a future
            screen-specific action. */}
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={pathname === "/settings" ? "page" : undefined}
          className={`-mr-1.5 rounded-lg p-1.5 transition-colors hover:bg-surface-2 ${
            pathname === "/settings" ? "text-accent" : "text-muted hover:text-ink"
          }`}
        >
          <Settings size={17} strokeWidth={1.75} />
        </Link>
        </div>
      </div>
    </header>
  );
}
