"use client";

import { Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { PrivacyToggle } from "@/components/shell/PrivacyToggle";
import { navTitleFor } from "@/lib/nav";

/**
 * Mobile-only header. Desktop gets its identity from the sidebar, so repeating
 * a title bar there would just be chrome for chrome's sake.
 */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const onSettings = pathname.startsWith("/settings");

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
        {onSettings ? (
          // The gear opened Settings, so in Settings the same spot closes it —
          // the second tap people instinctively make (Romano's ask,
          // 2026-07-22). Back where possible; Home if Settings was the
          // first page this session.
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push("/");
            }}
            className="-mr-1.5 rounded-lg p-1.5 text-accent transition-colors hover:bg-surface-2"
          >
            <X size={17} strokeWidth={1.75} />
          </button>
        ) : (
          <Link
            href="/settings"
            aria-label="Settings"
            className="-mr-1.5 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Settings size={17} strokeWidth={1.75} />
          </Link>
        )}
        </div>
      </div>
    </header>
  );
}
