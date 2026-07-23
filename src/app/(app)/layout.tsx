import { BottomTabs } from "@/components/shell/BottomTabs";
import { LogFab } from "@/components/shell/LogFab";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * The authenticated shell (CLAUDE.md §6): sidebar ≥ md, bottom tabs below.
 *
 * Everything inside this route group is already gated by `src/proxy.ts`, which
 * denies by default — no per-page guard to remember or forget.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
    <div className="min-h-dvh">
      <Sidebar />
      <div className="md:pl-60">
        <TopBar />
        {/* Bottom padding must clear the FAB, not just the tab bar: the FAB's
            bottom edge sits 4.5rem (+ safe inset) up, it is 3.5rem tall, and
            1rem of breathing room keeps the last row's amount readable beside
            it. 7rem (the old pb-28) only cleared the tab bar, so the FAB sat
            on the final row of every scrolling list. This is the app's only
            scroll container, so the fix covers every screen the FAB shows on;
            ≥ md the FAB is hidden and md:py-8 takes over.
            `app-main` lets globals.css swap these paddings when the tab bar
            is docked to the top (data-nav="top") — bar headroom above, only
            FAB clearance below. */}
        <main className="app-main mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(9rem+env(safe-area-inset-bottom,0px))] md:px-8 md:py-8">
          {children}
        </main>
      </div>
      <LogFab />
      <BottomTabs />
    </div>
    </ToastProvider>
  );
}
