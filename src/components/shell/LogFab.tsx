"use client";

import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { LogTransaction } from "@/components/transactions/LogTransaction";
import type { HomeSummary } from "@/lib/server/home";

async function fetcher(url: string): Promise<HomeSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load defaults.");
  return response.json();
}

/**
 * One thumb, one tap, from anywhere (UX pass 1 + mobile pass 5).
 *
 * Logging a transaction is the most frequent action in the app, but it could
 * only be started from Home or Transactions — anywhere else meant a tab
 * switch first. The button sits bottom-right, inside natural thumb reach,
 * on every mobile screen.
 *
 * Hidden on /reset, whose own sticky action bar owns that corner, and on
 * desktop, where the sidebar screens already carry their own buttons.
 */
export function LogFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { mutate } = useSWRConfig();

  // Same key Home uses, so the payload is shared, not fetched twice.
  const { data } = useSWR<HomeSummary>("/api/home?period=cycle", fetcher, {
    revalidateOnFocus: false,
  });

  if (pathname === "/reset") return null;

  return (
    <>
      <button
        type="button"
        aria-label="Log a transaction"
        onClick={() => setOpen(true)}
        // `log-fab`: globals.css drops the button toward the screen edge when
        // the tab bar is docked to the top (data-nav="top") — it stays
        // bottom-right in both modes, that's a thumb decision, not a nav one.
        className="log-fab fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 grid size-14 place-items-center rounded-full bg-accent text-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition-transform active:scale-90 md:hidden"
      >
        <Plus size={26} strokeWidth={2.25} />
      </button>

      <LogTransaction
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          // A new entry touches balances, budgets, stats and the ledger — let
          // every screen's cache refetch rather than guessing which.
          void mutate((key) => typeof key === "string" && key.startsWith("/api/"));
        }}
        defaultAccount={data?.defaults.accountLabel ?? undefined}
        suggestedCategories={data?.defaults.categories}
        recentDescriptions={data?.defaults.descriptions}
        accounts={data?.defaults.accounts}
        allCategories={data?.defaults.allCategories}
        kidAccounts={data?.defaults.kidAccounts}
        suggestsNewCycle={data?.defaults.suggestsNewCycle}
        quickLinks={data?.defaults.quickLinks}
        frequent={data?.defaults.frequent}
      />
    </>
  );
}
