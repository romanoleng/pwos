"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { archiveRecord, restoreRecord } from "@/app/actions/records";
import { useToast } from "@/components/ui/Toast";

/**
 * Delete a record, consistently, anywhere (Romano's ask, 2026-07-24).
 *
 * "Delete means archive" (§9b): the row leaves every screen but survives in
 * the database, so an account with six months of transactions or a goal with
 * history is never actually destroyed. An ~8s undo toast is the safety net,
 * not a confirmation dialog — faster, and it doesn't train you to click
 * through. Same registry KIND boundary as every other record action.
 */
export function DeleteRecordButton({
  kind,
  recordId,
  label,
  onDone,
  className = "",
}: {
  kind: string;
  recordId: string;
  /** Shown in the toast so it's clear what left. */
  label: string;
  onDone?: () => void;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const result = await archiveRecord(kind, recordId);
    setBusy(false);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    onDone?.();
    toast.show({
      message: `${label} removed`,
      tone: "neutral",
      onUndo: async () => {
        await restoreRecord(kind, recordId);
        onDone?.();
        toast.show({ message: `${label} back`, tone: "neutral" });
      },
    });
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={remove}
      aria-label={`Delete ${label}`}
      title={`Delete ${label}`}
      className={`rounded-lg p-1.5 text-faint transition-colors hover:text-loss disabled:opacity-40 ${className}`}
    >
      <Trash2 size={13} strokeWidth={1.75} />
    </button>
  );
}
