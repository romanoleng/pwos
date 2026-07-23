"use client";

import { useState } from "react";
import useSWR from "swr";

import {
  runFreshStart, setShowHistory, undoFreshStart,
} from "@/app/actions/freshStart";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/format";

type State = { cutoverDate: string | null; showingHistory: boolean };

async function fetcher(url: string): Promise<State> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load.");
  return response.json();
}

/**
 * The reset, and the switch that brings the history back.
 *
 * Deliberately not a one-tap button: it changes what every screen shows, so
 * the date is typed and the consequences are listed before anything happens.
 */
export function FreshStart({ defaultDate }: { defaultDate: string }) {
  const { data, mutate } = useSWR<State>("/api/cutover", fetcher);
  const toast = useToast();
  const [date, setDate] = useState(defaultDate);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = data?.cutoverDate ?? null;

  async function onRun() {
    setBusy(true);
    const result = await runFreshStart(date);
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    void mutate();
    const { hiddenTransactions, balancesCleared, clearedBalances } = result.data;
    toast.show({
      message: `Fresh start from ${formatDate(date)} — ${hiddenTransactions} entries and ${balancesCleared} balances put aside`,
      tone: "success",
      onUndo: async () => {
        // Passing the cleared figures back restores them too — without this
        // the undo only brought back history and left the balances wiped.
        await undoFreshStart(clearedBalances);
        void mutate();
        toast.show({ message: "Reset undone — everything is back", tone: "neutral" });
      },
    });
  }

  return (
    <Card>
      <CardHeader
        title="Fresh start"
        description="Make the app look newly installed from a date you choose."
      />
      <CardBody className="space-y-3">
        {active ? (
          <>
            <p className="text-xs leading-relaxed text-muted">
              Active since <span className="text-ink">{formatDate(active)}</span>. Everything
              before that is hidden, not deleted — {data?.showingHistory ? "and currently shown" : "and still in the database"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await setShowHistory(!data?.showingHistory);
                  setBusy(false);
                  void mutate();
                }}
                className="rounded-lg border border-line px-3 py-2 text-xs font-medium disabled:opacity-60"
              >
                {data?.showingHistory ? "Hide history again" : "Show history from before"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await undoFreshStart();
                  setBusy(false);
                  void mutate();
                  toast.show({ message: "Reset undone", tone: "neutral" });
                }}
                className="rounded-lg border border-line px-3 py-2 text-xs text-muted disabled:opacity-60"
              >
                Cancel the reset
              </button>
            </div>
          </>
        ) : confirming ? (
          <>
            <p className="text-xs font-medium">From {formatDate(date)} onwards, the app will:</p>
            <ul className="space-y-1 text-[11px] leading-relaxed text-muted">
              <li>· Hide every transaction and budget line before that date</li>
              <li>· Clear every account balance except your spendable cards</li>
              <li>· Keep categories, accounts, debts, goals and all crypto untouched</li>
              <li>· Delete nothing — one switch brings it all back</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onRun}
                disabled={busy}
                className="rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {busy ? "Resetting…" : "Yes, start fresh"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-line px-3.5 py-2 text-xs text-muted"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className="text-[11px] text-faint">Start from</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 block h-10 rounded-lg border border-line bg-surface-2 px-3 text-base outline-none sm:text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium"
            >
              Review what this does
            </button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
