"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import {
  removeQuickLink,
  reorderQuickLink,
  restoreQuickLink,
  saveQuickLink,
} from "@/app/actions/quicklinks";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import type { HomeSummary } from "@/lib/server/home";
import type { QuickLink } from "@/lib/server/logmeta";

async function fetcher(url: string): Promise<HomeSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load quick links.");
  return response.json();
}

/**
 * The logger's quick links, made Romano's to configure (2026-07-23).
 *
 * Each link is a label pointing at a category, or a category + subcategory.
 * In the logger, tapping one pre-fills both and puts the cursor in the
 * amount — it never logs by itself, because the amount always varies.
 */
export function QuickLinksEditor() {
  // Same key the logger uses, so the chips and this editor share one payload.
  const { data, mutate } = useSWR<HomeSummary>("/api/home?period=cycle", fetcher, {
    revalidateOnFocus: false,
  });
  const { mutate: mutateAll } = useSWRConfig();
  const toast = useToast();
  const [editing, setEditing] = useState<QuickLink | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const links = data?.defaults.quickLinks ?? [];
  const categories = data?.defaults.allCategories ?? [];
  const subcategoriesByCategory = data?.defaults.frequent.subcategoriesByCategory ?? {};

  const refresh = () => {
    void mutate();
    void mutateAll((key) => typeof key === "string" && key.startsWith("/api/home"));
  };

  async function onRemove(link: QuickLink) {
    setBusy(true);
    const result = await removeQuickLink(link.id);
    setBusy(false);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    refresh();
    toast.show({
      message: `${link.label} removed`,
      tone: "neutral",
      onUndo: async () => {
        await restoreQuickLink(link.id);
        refresh();
        toast.show({ message: `${link.label} back`, tone: "neutral" });
      },
    });
  }

  async function onMove(link: QuickLink, direction: "up" | "down") {
    setBusy(true);
    const result = await reorderQuickLink(link.id, direction);
    setBusy(false);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Quick links"
        description="The one-tap chips in the logger. Each pre-fills a category — or a category and subcategory — and puts the cursor on the amount."
        action={
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium hover:bg-surface-2"
          >
            <Plus size={12} strokeWidth={2} />
            Add
          </button>
        }
      />
      {links.length === 0 ? (
        <CardBody className="text-sm text-muted">
          None yet — the logger falls back to your pinned categories.
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {links.map((link, index) => (
            <li key={link.id} className="flex items-center gap-2 px-4 py-2.5">
              <Zap size={14} strokeWidth={1.75} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{link.label}</span>
                <span className="mt-0.5 block truncate text-[11px] text-faint">
                  {link.category
                    ? [link.category, link.subcategory].filter(Boolean).join(" · ")
                    : "Not aimed at a category yet"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <IconButton
                  label={`Move ${link.label} up`}
                  disabled={busy || index === 0}
                  onClick={() => onMove(link, "up")}
                >
                  <ArrowUp size={13} strokeWidth={1.75} />
                </IconButton>
                <IconButton
                  label={`Move ${link.label} down`}
                  disabled={busy || index === links.length - 1}
                  onClick={() => onMove(link, "down")}
                >
                  <ArrowDown size={13} strokeWidth={1.75} />
                </IconButton>
                <IconButton
                  label={`Edit ${link.label}`}
                  disabled={busy}
                  onClick={() => setEditing(link)}
                >
                  <Pencil size={13} strokeWidth={1.75} />
                </IconButton>
                <IconButton
                  label={`Remove ${link.label}`}
                  disabled={busy}
                  onClick={() => onRemove(link)}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing !== null ? (
        <QuickLinkForm
          link={editing === "new" ? null : editing}
          categories={categories.map((c) => c.name)}
          subcategoriesByCategory={subcategoriesByCategory}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function QuickLinkForm({
  link,
  categories,
  subcategoriesByCategory,
  onClose,
  onSaved,
}: {
  link: QuickLink | null;
  categories: string[];
  subcategoriesByCategory: Record<string, string[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState(link?.label ?? "");
  const [category, setCategory] = useState(link?.category ?? "");
  const [subcategory, setSubcategory] = useState(link?.subcategory ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await saveQuickLink({
      id: link?.id,
      // The label defaults to the finest target named — the natural chip text.
      label: label.trim() || subcategory.trim() || category,
      category: category || null,
      subcategory: subcategory || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    toast.show({ message: link ? "Quick link updated" : "Quick link added", tone: "success" });
  }

  return (
    <SlideOver
      open
      onClose={onClose}
      title={link ? "Edit quick link" : "New quick link"}
      description="Pre-fills the logger; it never logs by itself."
    >
      <Field label="Label" hint="What the chip says.">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className={inputClass}
          placeholder={subcategory || category || "Braai"}
        />
      </Field>

      <Field label="Category">
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setSubcategory("");
          }}
          className={inputClass}
        >
          <option value="" disabled>
            Pick one…
          </option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Subcategory"
        hint="Optional. A new name here creates the subcategory."
      >
        <input
          value={subcategory}
          onChange={(event) => setSubcategory(event.target.value)}
          list="pwos-quicklink-subcategories"
          autoComplete="off"
          className={inputClass}
          placeholder="None — just the category"
        />
        <datalist id="pwos-quicklink-subcategories">
          {(category ? (subcategoriesByCategory[category] ?? []) : []).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>

      {error ? (
        <p role="alert" className="mb-3 text-xs text-loss">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving || (!category && !label.trim())}
        onClick={submit}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : link ? "Save changes" : "Add quick link"}
      </button>
    </SlideOver>
  );
}
