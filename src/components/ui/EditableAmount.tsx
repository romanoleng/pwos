"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { revertEditableValue, updateEditableValue } from "@/app/actions/edit";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { editableField, validateEditable } from "@/lib/editable";

/**
 * Tap a figure, change it, done (CLAUDE.md §9b — "inline edit for single
 * values"). Used by every module, so editing feels identical everywhere.
 *
 * The component knows only a registry key; the server owns which table and
 * column that maps to.
 */
export function EditableAmount({
  editKey,
  recordId,
  value,
  onSaved,
  className = "",
  variant = "whole",
}: {
  editKey: string;
  recordId: string;
  value: number | null;
  onSaved?: () => void;
  className?: string;
  variant?: "standard" | "whole";
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const field = editableField(editKey);

  async function commit() {
    if (!field) return;
    const numeric = Number(draft);
    const invalid = validateEditable(field, numeric);
    if (invalid) {
      toast.show({ message: invalid, tone: "error" });
      return;
    }
    if (numeric === value) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await updateEditableValue(editKey, recordId, numeric);
    setSaving(false);
    setEditing(false);

    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }

    const { previousValue } = result.data;
    onSaved?.();
    toast.show({
      message: `${field.label} updated`,
      tone: "success",
      onUndo: async () => {
        const undone = await revertEditableValue(editKey, recordId, previousValue);
        onSaved?.();
        toast.show(
          undone.ok
            ? { message: `${field.label} restored`, tone: "neutral" }
            : { message: `Couldn't undo: ${undone.error}`, tone: "error" },
        );
      },
    });
  }

  if (!field) return <Money value={value ?? 0} variant={variant} className={className} />;

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step="0.01"
        inputMode="decimal"
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          }
          if (event.key === "Escape") setEditing(false);
        }}
        aria-label={field.label}
        className="tnum h-7 w-28 rounded border border-accent bg-surface-2 px-1.5 text-right text-sm outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value === null ? "" : String(value));
        setEditing(true);
      }}
      title={`Edit ${field.label.toLowerCase()}`}
      className={`group inline-flex items-center gap-1.5 rounded px-1 -mx-1 transition-colors hover:bg-surface-2 ${className}`}
    >
      {value === null ? (
        <span className="text-warn">Not set</span>
      ) : (
        <Money value={value} variant={variant} />
      )}
      <Pencil
        size={11}
        strokeWidth={1.75}
        className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
