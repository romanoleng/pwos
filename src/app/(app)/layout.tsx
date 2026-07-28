import { AssistantChat } from "@/components/shell/AssistantChat";
import { AutoLock } from "@/components/shell/AutoLock";
import { BottomTabs } from "@/components/shell/BottomTabs";
import { LogFab } from "@/components/shell/LogFab";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { TopTabs } from "@/components/shell/TopTabs";
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
    {/* On mobile this is a flex COLUMN (globals.css .app-shell): the header,
        quick-access strip, scrolling content and tab bar are stacked rows, so
        the bars are permanent and iOS Safari can't drop them mid-scroll. On
        desktop it's normal block flow — the fixed sidebar, then page scroll. */}
    <div className="app-shell min-h-dvh md:pl-60">
      <Sidebar />
      <TopBar />
      <TopTabs />
      {/* On mobile .app-main is the sole scroll container (flex:1, overflow
          auto). Bottom padding only needs to clear the floating + button now
          that the tab bar is a sibling row below, not an overlay. */}
      <main className="app-main mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:px-8 md:py-8">
        {children}
      </main>
      <BottomTabs />
      <LogFab />
      <AssistantChat />
      <AutoLock />
    </div>
    </ToastProvider>
  );
}
