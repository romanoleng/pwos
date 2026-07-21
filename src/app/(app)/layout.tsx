import { BottomTabs } from "@/components/shell/BottomTabs";
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
        {/* pb-28 keeps content clear of the fixed tab bar on mobile. */}
        <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 md:px-8 md:py-8">
          {children}
        </main>
      </div>
      <BottomTabs />
    </div>
    </ToastProvider>
  );
}
