"use client";

import { useState } from "react";

import { createBudgetLine, createCategory } from "@/app/actions/budgets";
import { parseAmount } from "@/lib/amount";
import { AmountInput } from "@/components/ui/AmountInput";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";

const NEW_CATEGORY = "__new__";

/**
 * Add a budget line, and create the category first if it doesn't exist yet.
 *
 * Both live in one sheet on purpose: needing a category that isn't there yet is
 * the most common reason a budget line can't be added, and sending someone to a
 * different screen to fix it loses the thing they were trying to do.
 */
export function BudgetLineEditor({
  open,
  onClose,
  onSaved,
  available,
  cycleLabel,
  moneyKind = "expense",
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Categories with no budget line this cycle. */
  available: { name: string; kind: string }[];
  cycleLabel: string;
  /** "expense" = a spending line; "contribution" = a putting-away line. */
  moneyKind?: "expense" | "contribution";
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  const creatingCategory = category === NEW_CATEGORY;
  const putAway = moneyKind === "contribution";

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);

    const budgetedZar = parseAmount(String(formData.get("budgetedZar") ?? "")) ?? Number.NaN;
    let name = String(formData.get("category") ?? "");

    if (name === NEW_CATEGORY) {
      const newName = String(formData.get("newCategory") ?? "").trim();
      // A new category made here takes the kind of the section it's added in —
      // an expense line makes an expense category, a put-away line a
      // contribution — so it can never land in the wrong list.
      const created = await createCategory({ name: newName, kind: moneyKind });
      if (!created.ok) {
        setSaving(false);
        setError(created.error);
        return;
      }
      name = created.data.name;
    }

    const result = await createBudgetLine({ category: name, budgetedZar });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCategory("");
    onClose();
    onSaved();
    toast.show({ message: `${name} budgeted`, tone: "success" });
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={putAway ? "Add a putting-away line" : "Add a budget line"}
      description={
        putAway
          ? `A set monthly amount you invest or save (e.g. crypto). Applies to ${cycleLabel}.`
          : `Applies to ${cycleLabel}. Past cycles stay as they were.`
      }
      footer={
        <button
          type="submit"
          form="budget-line-form"
          disabled={saving}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add line"}
        </button>
      }
    >
      <form action={onSubmit} id="budget-line-form">
        <Field label="Category">
          <select
            name="category"
            className={inputClass}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            required
          >
            <option value="" disabled>
              Pick one
            </option>
            {available.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
            <option value={NEW_CATEGORY}>+ New category…</option>
          </select>
        </Field>

        {creatingCategory ? (
          <Field label="New category name" hint="Appears in the log sheet straight away.">
            <input
              name="newCategory"
              required
              autoComplete="off"
              className={inputClass}
              placeholder={putAway ? "Crypto DCA" : "School fees"}
            />
          </Field>
        ) : null}

        <Field label="Monthly amount" hint="Change it any time by tapping it on the list.">
          <AmountInput name="budgetedZar" required placeholder="0,00" />
        </Field>

        {error ? <p className="mt-1 text-xs text-loss">{error}</p> : null}
      </form>
    </SlideOver>
  );
}
