"use client";

import { Archive, ArrowRight, Check, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { archiveRecord, restoreRecord } from "@/app/actions/records";
import { applyReset, revertReset, type ResetPrevious } from "@/app/actions/reset";
import { AmountInput } from "@/components/ui/AmountInput";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { RecordEditor } from "@/components/ui/RecordEditor";
import { useToast } from "@/components/ui/Toast";
import { parseAmount } from "@/lib/amount";
import { formatDate } from "@/lib/format";
import type { RecordKind } from "@/lib/records";
import type { ResetState } from "@/lib/server/reset";

async function fetcher(url: string): Promise<ResetState> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load the reset screen.");
  return response.json();
}

/**
 * Payday reset — reconcile the app against reality in one pass.
 *
 * Nothing writes until you've seen the full list of changes. A reset touches
 * every balance in the app at once, so a preview isn't ceremony: it's the only
 * point at which a mistyped figure is still cheap to catch.
 */
export function ResetScreen() {
  const { data, error, mutate } = useSWR<ResetState>("/api/reset", fetcher);
  const toast = useToast();

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"edit" | "review">("edit");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<RecordKind | null>(null);

  const changes = useMemo(() => {
    if (!data) return [];
    const out: {
      key: string;
      editKey: string;
      recordId: string;
      label: string;
      from: number | null;
      to: number;
    }[] = [];
    for (const group of data.groups) {
      for (const row of group.rows) {
        const key = `${row.editKey}:${row.recordId}`;
        const raw = draft[key];
        if (raw === undefined || raw.trim() === "") continue;
        const value = parseAmount(raw);
        if (value === null) continue;
        if (value === row.currentZar) continue;
        out.push({
          key,
          editKey: row.editKey,
          recordId: row.recordId,
          label: row.label,
          from: row.currentZar,
          to: value,
        });
      }
    }
    return out;
  }, [data, draft]);

  if (error) {
    return <Card><CardBody className="text-sm text-loss">Couldn&apos;t load the reset screen.</CardBody></Card>;
  }
  if (!data) {
    return <Card><CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody></Card>;
  }

  async function onArchive(kind: RecordKind, recordId: string, label: string) {
    const result = await archiveRecord(kind, recordId);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    void mutate();
    // Archived, not deleted — undo only flips the flag back.
    toast.show({
      message: `${label} archived`,
      tone: "neutral",
      onUndo: async () => {
        const undone = await restoreRecord(kind, recordId);
        void mutate();
        toast.show(
          undone.ok
            ? { message: `${label} restored`, tone: "neutral" }
            : { message: `Couldn't undo: ${undone.error}`, tone: "error" },
        );
      },
    });
  }

  async function commit() {
    setSaving(true);
    const result = await applyReset(
      changes.map((c) => ({ editKey: c.editKey, recordId: c.recordId, value: c.to })),
    );
    setSaving(false);

    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }

    const previous: ResetPrevious[] = result.data.previous;
    setDraft({});
    setStage("edit");
    void mutate();

    toast.show({
      message: `${result.data.applied} balances updated`,
      tone: "success",
      // The whole reset undoes as one unit — a partial revert would be worse
      // than none, leaving some figures new and others old.
      onUndo: async () => {
        const undone = await revertReset(previous);
        void mutate();
        toast.show(
          undone.ok
            ? { message: "Reset undone", tone: "neutral" }
            : { message: `Couldn't undo: ${undone.error}`, tone: "error" },
        );
      },
    });
  }

  if (stage === "review") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Review before writing"
            description={`${changes.length} ${changes.length === 1 ? "value" : "values"} will change. Nothing else is touched.`}
          />
          <ul className="divide-y divide-line">
            {changes.map((change) => (
              <li key={change.key} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{change.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-sm">
                  <Money
                    value={change.from ?? 0}
                    variant="whole"
                    className="text-faint line-through"
                  />
                  <ArrowRight size={12} strokeWidth={2} className="text-faint" />
                  <Money value={change.to} variant="whole" />
                </span>
              </li>
            ))}
          </ul>
          <CardBody className="flex flex-wrap gap-2 border-t border-line">
            <button
              type="button"
              onClick={commit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Check size={15} strokeWidth={2} />
              {saving ? "Writing…" : `Write ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
            </button>
            <button
              type="button"
              onClick={() => setStage("edit")}
              disabled={saving}
              className="rounded-lg border border-line px-3.5 py-2 text-sm text-muted transition-colors hover:text-ink disabled:opacity-60"
            >
              Back to editing
            </button>
          </CardBody>
        </Card>
        <p className="text-[11px] leading-relaxed text-faint">
          Transactions are not touched. This corrects positions, not history — and
          the whole thing can be undone in one go straight afterwards.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-sm font-medium">
            Cycle {formatDate(data.cycle.start)} → {formatDate(data.cycle.end)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Type the real figure next to anything that&apos;s changed. Leave the rest
            blank. Nothing is written until you review.
          </p>
        </CardBody>
      </Card>

      {data.groups.map((group) => (
        <Card key={group.title}>
          <CardHeader
            title={group.title}
            description={group.description}
            action={
              group.recordKind ? (
                <button
                  type="button"
                  onClick={() => setAdding(group.recordKind)}
                  className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium hover:bg-surface-2"
                >
                  <Plus size={13} strokeWidth={2} />
                  Add
                </button>
              ) : null
            }
          />
          <ul className="divide-y divide-line">
            {group.rows.map((row) => {
              const key = `${row.editKey}:${row.recordId}`;
              const value = draft[key] ?? "";
              const parsed = parseAmount(value);
              const changed = parsed !== null && parsed !== row.currentZar;
              const invalid = value.trim() !== "" && parsed === null;
              return (
                <li key={key} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{row.label}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                      <span>
                        now <Money value={row.currentZar ?? 0} variant="whole" />
                        {row.hint ? ` · ${row.hint}` : ""}
                      </span>
                      {group.recordKind ? (
                        <button
                          type="button"
                          onClick={() =>
                            void onArchive(group.recordKind!, row.recordId, row.label)
                          }
                          aria-label={`Archive ${row.label}`}
                          title="Archive — hides it everywhere, keeps the history"
                          className="text-faint transition-colors hover:text-warn"
                        >
                          <Archive size={12} strokeWidth={1.75} />
                        </button>
                      ) : null}
                    </p>
                  </div>
                  <AmountInput
                    value={value}
                    onChange={(next) =>
                      setDraft((current) => ({ ...current, [key]: next }))
                    }
                    placeholder="—"
                    aria-label={`New value for ${row.label}`}
                    className={`tnum h-9 w-32 shrink-0 rounded-lg border bg-surface-2 px-2 text-right text-sm outline-none transition-colors ${
                      invalid
                        ? "border-loss text-loss"
                        : changed
                          ? "border-accent text-ink"
                          : "border-line placeholder:text-faint"
                    }`}
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {adding ? (
        <RecordEditor
          open
          kind={adding}
          onClose={() => setAdding(null)}
          onSaved={() => void mutate()}
        />
      ) : null}

      <div className="pb-safe sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-md md:mx-0 md:rounded-xl md:border">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {changes.length === 0
              ? "No changes yet"
              : `${changes.length} ${changes.length === 1 ? "change" : "changes"} ready`}
          </p>
          <div className="flex gap-2">
            {changes.length > 0 ? (
              <button
                type="button"
                onClick={() => setDraft({})}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs text-muted transition-colors hover:text-ink"
              >
                <RotateCcw size={13} strokeWidth={1.75} />
                Clear
              </button>
            ) : null}
            <button
              type="button"
              disabled={changes.length === 0}
              onClick={() => setStage("review")}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
