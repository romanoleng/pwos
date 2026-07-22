"use client";

import { Archive, ArrowDown, ArrowUp, Merge, Pencil, Pin, RotateCcw } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import {
  archiveCategory, mergeCategories, renameCategory, reorderCategory,
  setCategoryPinned, undoMerge,
} from "@/app/actions/categories";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Card, CardBody } from "@/components/ui/Card";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Money } from "@/components/ui/Money";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { iconForCategory } from "@/lib/categoryIcons";
import type { CategoryRow } from "@/lib/server/categories";

async function fetcher(url: string): Promise<{ categories: CategoryRow[] }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load categories.");
  return response.json();
}

const KIND_LABEL: Record<string, string> = {
  expense: "Spending",
  income: "Money in",
  contribution: "Putting away",
  transfer: "Moving money",
};

/**
 * Rename, merge, retire and reorder categories (build report item 06).
 *
 * No subcategories, deliberately. Twenty expense categories don't need a
 * second level, and nesting would add a picker step to logging — the one
 * action that has to stay fast.
 *
 * Income and spending are separate lists because they're different shapes, and
 * because a merge across kinds would silently reclassify money.
 */
export function CategoryManager() {
  const { data, error, mutate } = useSWR<{ categories: CategoryRow[] }>(
    "/api/categories",
    fetcher,
  );
  const toast = useToast();
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [merging, setMerging] = useState<CategoryRow | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <Card>
        <CardBody className="text-sm text-loss">Couldn&apos;t load categories.</CardBody>
      </Card>
    );
  }
  if (!data) {
    return (
      <LoadingCard rows={4} />
    );
  }

  const refresh = () => void mutate();
  const active = data.categories.filter((c) => !c.archived);
  const archived = data.categories.filter((c) => c.archived);
  const kinds = [...new Set(active.map((c) => c.kind))];

  async function onArchive(row: CategoryRow) {
    setBusy(true);
    const result = await archiveCategory(row.name, true);
    setBusy(false);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    refresh();
    toast.show({
      message:
        result.data.stillTagging > 0
          ? `${row.name} retired — ${result.data.stillTagging} entries keep the tag`
          : `${row.name} retired`,
      tone: "neutral",
      onUndo: async () => {
        await archiveCategory(row.name, false);
        refresh();
        toast.show({ message: `${row.name} back`, tone: "neutral" });
      },
    });
  }

  async function onPin(row: CategoryRow) {
    setBusy(true);
    await setCategoryPinned(row.name, !row.pinned);
    setBusy(false);
    refresh();
  }

  async function onMove(row: CategoryRow, direction: "up" | "down") {
    setBusy(true);
    const result = await reorderCategory(row.name, direction);
    setBusy(false);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="text-[11px] leading-relaxed text-muted">
          Renaming keeps every tagged entry — the database moves them for you.
          Retiring hides a category from the pickers but leaves history intact.
          Merging retags everything and can be undone.
        </CardBody>
      </Card>

      {kinds.map((kind) => (
        <CollapsibleSection
          key={kind}
          id={`categories:${kind}`}
          title={KIND_LABEL[kind] ?? kind}
          description={`${active.filter((c) => c.kind === kind).length} categories`}
        >
          <ul className="divide-y divide-line">
            {active
              .filter((category) => category.kind === kind)
              .map((category) => (
                <li key={category.name} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {(() => {
                          const Icon = iconForCategory(category.name);
                          return <Icon size={14} strokeWidth={1.75} className="shrink-0 text-muted" />;
                        })()}
                        {category.name}
                        {category.pinned ? (
                          <Pin
                            size={11}
                            strokeWidth={2}
                            className="ml-1.5 inline text-accent"
                            aria-label="Pinned to the log sheet"
                          />
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-faint">
                        {category.transactionCount}{" "}
                        {category.transactionCount === 1 ? "entry" : "entries"}
                        {category.spentZar > 0 ? (
                          <>
                            {" · "}
                            <Money value={category.spentZar} variant="whole" />
                          </>
                        ) : null}
                        {category.budgeted ? " · budgeted" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconButton
                        label={`Move ${category.name} up`}
                        onClick={() => void onMove(category, "up")}
                        disabled={busy}
                      >
                        <ArrowUp size={15} strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label={`Move ${category.name} down`}
                        onClick={() => void onMove(category, "down")}
                        disabled={busy}
                      >
                        <ArrowDown size={15} strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label={`${category.pinned ? "Unpin" : "Pin"} ${category.name}`}
                        onClick={() => void onPin(category)}
                        disabled={busy}
                        active={category.pinned}
                      >
                        <Pin size={15} strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label={`Rename ${category.name}`}
                        onClick={() => setEditing(category)}
                        disabled={busy}
                      >
                        <Pencil size={15} strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label={`Merge ${category.name} into another`}
                        onClick={() => setMerging(category)}
                        disabled={busy}
                      >
                        <Merge size={15} strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label={`Retire ${category.name}`}
                        onClick={() => void onArchive(category)}
                        disabled={busy}
                      >
                        <Archive size={15} strokeWidth={1.75} />
                      </IconButton>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </CollapsibleSection>
      ))}

      {archived.length > 0 ? (
        <CollapsibleSection
          id="categories:archived"
          title="Retired"
          description="Hidden from pickers. Their history still counts."
        >
          <ul className="divide-y divide-line">
            {archived.map((category) => (
              <li
                key={category.name}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted">{category.name}</p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {category.transactionCount} still tagged
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await archiveCategory(category.name, false);
                    refresh();
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium hover:bg-surface-2"
                >
                  <RotateCcw size={12} strokeWidth={1.75} />
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      <RenameSheet
        category={editing}
        onClose={() => setEditing(null)}
        onDone={refresh}
      />
      <MergeSheet
        category={merging}
        candidates={active.filter((c) => c.kind === merging?.kind && c.name !== merging?.name)}
        onClose={() => setMerging(null)}
        onDone={refresh}
      />
    </div>
  );
}

function IconButton({
  label, onClick, disabled, active, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-9 place-items-center rounded-lg transition-colors disabled:opacity-30 ${
        active ? "text-accent" : "text-faint hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function RenameSheet({
  category, onClose, onDone,
}: {
  category: CategoryRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    if (!category) return;
    setSaving(true);
    setError(null);
    const result = await renameCategory(category.name, String(formData.get("name") ?? ""));
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    onDone();
    toast.show({
      message: `Renamed to ${result.data.to}${
        result.data.moved > 0 ? ` — ${result.data.moved} entries followed` : ""
      }`,
      tone: "success",
    });
  }

  return (
    <SlideOver
      open={category !== null}
      onClose={onClose}
      title={`Rename ${category?.name ?? ""}`}
      description="Every tagged entry follows automatically. History isn't forked."
      footer={
        <button
          type="submit"
          form="rename-form"
          disabled={saving}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Rename"}
        </button>
      }
    >
      <form action={onSubmit} id="rename-form">
        <Field
          label="New name"
          hint={
            category && category.transactionCount > 0
              ? `${category.transactionCount} entries carry this tag.`
              : undefined
          }
        >
          <input
            key={category?.name}
            name="name"
            required
            autoComplete="off"
            defaultValue={category?.name}
            className={inputClass}
          />
        </Field>
        {error ? <p className="mt-1 text-xs text-loss">{error}</p> : null}
      </form>
    </SlideOver>
  );
}

function MergeSheet({
  category, candidates, onClose, onDone,
}: {
  category: CategoryRow | null;
  candidates: CategoryRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    if (!category) return;
    setSaving(true);
    setError(null);
    const target = String(formData.get("target") ?? "");
    const result = await mergeCategories(category.name, target);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    onDone();
    const { undo, moved } = result.data;
    toast.show({
      message: `${category.name} folded into ${target}${
        moved > 0 ? ` — ${moved} entries retagged` : ""
      }`,
      tone: "success",
      onUndo: async () => {
        const undone = await undoMerge(undo);
        onDone();
        toast.show(
          undone.ok
            ? { message: `${category.name} restored`, tone: "neutral" }
            : { message: `Couldn't undo: ${undone.error}`, tone: "error" },
        );
      },
    });
  }

  return (
    <SlideOver
      open={category !== null}
      onClose={onClose}
      title={`Merge ${category?.name ?? ""}`}
      description="Its entries and budget are retagged, then it retires. Undoable."
      footer={
        <button
          type="submit"
          form="merge-form"
          disabled={saving || candidates.length === 0}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Merging…" : "Merge"}
        </button>
      }
    >
      <form action={onSubmit} id="merge-form">
        <Field
          label="Fold into"
          hint="Only categories of the same kind — merging across would change what the money means."
        >
          <select name="target" className={inputClass} required defaultValue="">
            <option value="" disabled>
              Pick one
            </option>
            {candidates.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name} ({option.transactionCount})
              </option>
            ))}
          </select>
        </Field>
        {category && category.transactionCount > 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {category.transactionCount}{" "}
            {category.transactionCount === 1 ? "entry moves" : "entries move"} across.
          </p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-loss">{error}</p> : null}
      </form>
    </SlideOver>
  );
}
