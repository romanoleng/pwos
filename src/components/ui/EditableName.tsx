"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { renameRecord } from "@/app/actions/records";
import { useToast } from "@/components/ui/Toast";

/**
 * Tap a name, change it — the text twin of EditableAmount (Romano's ask,
 * 2026-07-24: rename accounts, goals, savings, everywhere, consistently).
 *
 * The component knows only a registry KIND ("account", "goal", …); the server
 * owns which table and column that maps to (src/lib/records.ts). Same optimistic
 * pattern as every other edit: it writes, then offers undo via the toast.
 */
export function EditableName({
  kind,
  recordId,
  value,
  onSaved,
  className = "",
}: {
  kind: string;
  recordId: string;
  value: string;
  onSaved?: () => void;
  className?: string;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    setSaving(true);
    const result = await renameRecord(kind, recordId, next);
    setSaving(false);
    if (!result.ok) {
      setDraft(value);
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    onSaved?.();
    toast.show({
      message: `Renamed to ${result.data.name}`,
      tone: "success",
      onUndo: async () => {
        await renameRecord(kind, recordId, value);
        onSaved?.();
        toast.show({ message: `Back to ${value}`, tone: "neutral" });
      },
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          }
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        aria-label="Rename"
        className="h-8 w-full min-w-0 rounded border border-accent bg-surface-2 px-1.5 text-sm outline-none sm:h-7"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Rename"
      className={`group inline-flex min-w-0 items-center gap-1.5 rounded px-1 -mx-1 text-left transition-colors hover:bg-surface-2 ${className}`}
    >
      <span className="truncate">{value}</span>
      <Pencil
        size={11}
        strokeWidth={1.75}
        className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
