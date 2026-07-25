"use client";

import { Clock, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { Money } from "@/components/ui/Money";
import { useValuesHidden } from "@/lib/privacy";
import type { BriefFact, DailyBrief as Brief } from "@/lib/server/brief";

async function fetcher(url: string): Promise<Brief> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("brief unavailable");
  return response.json();
}

const DISMISS_KEY = "pwos-brief-dismissed";
const TONE_TEXT = { gain: "text-gain", loss: "text-loss", flat: "text-muted" } as const;

/**
 * The daily brief card at the top of Home (Romano's ask, 2026-07-25). Coach
 * voice, one sentence, over exact figures the app computed — see
 * lib/server/brief.ts. Deliberately supplementary: while it loads, on any
 * error, or once dismissed for the day, it renders nothing rather than a
 * skeleton, so it never delays the number that answers "can I spend?".
 *
 * Dismissal is per-day and lives in localStorage — no server write, and it
 * naturally reappears tomorrow when the date key no longer matches.
 */
export function DailyBrief() {
  const { data, error } = useSWR<Brief>("/api/brief", fetcher, {
    revalidateOnFocus: false,
    // It's a once-a-day snapshot; no polling. One fetch on mount is enough.
    revalidateIfStale: false,
    shouldRetryOnError: false,
  });
  const valuesHidden = useValuesHidden();

  // Read the dismissal only after mount to avoid a hydration mismatch.
  const [dismissedDate, setDismissedDate] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setDismissedDate(localStorage.getItem(DISMISS_KEY));
    } catch {
      /* private browsing — treat as not dismissed */
    }
    setReady(true);
  }, []);

  if (!ready || error || !data) return null;
  if (dismissedDate === data.date) return null;

  function dismiss() {
    if (!data) return;
    try {
      localStorage.setItem(DISMISS_KEY, data.date);
    } catch {
      /* in-memory only for this session */
    }
    setDismissedDate(data.date);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_3px] shadow-accent/20" />
          Your brief · {data.greeting}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss today's brief"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <p className="text-[15px] leading-relaxed">
        {valuesHidden ? (
          <span className="text-muted">Tap the eye to reveal today&apos;s brief.</span>
        ) : (
          data.body
        )}
      </p>

      {data.facts.length > 0 ? (
        <div className="mt-3.5 flex gap-2 overflow-x-auto no-scrollbar">
          {data.facts.map((fact) => (
            <FactChip key={fact.key} fact={fact} />
          ))}
        </div>
      ) : null}

      <Link
        href="/crypto"
        className="mt-3.5 flex items-center gap-1.5 text-[11px] text-faint transition-colors hover:text-muted"
      >
        <Clock size={12} strokeWidth={2} className="shrink-0" />
        Built this morning from your live numbers
      </Link>
    </section>
  );
}

function FactChip({ fact }: { fact: BriefFact }) {
  const toneClass = fact.kind !== "text" && fact.tone ? TONE_TEXT[fact.tone] : "";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border border-line bg-surface-2 px-2.5 py-2">
      <span className="whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-[0.06em] text-faint">
        {fact.label}
      </span>
      <span className={`truncate text-sm font-semibold ${toneClass}`}>
        {fact.kind === "money" ? (
          fact.amount === null ? (
            <span className="text-faint">—</span>
          ) : (
            <Money value={fact.amount} variant="whole" tone={fact.tone ?? "none"} />
          )
        ) : (
          fact.value
        )}
      </span>
    </div>
  );
}
