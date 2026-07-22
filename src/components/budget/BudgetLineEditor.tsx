"use client";

import { useState } from "react";

import { createBudgetLine, createCategory } from "@/app/actions/budgets";
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
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Categories with no budget line this cycle. */
  available: { name: string; kind: string }[];
  cycleLabel: string;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  const creatingCategory = category === NEW_CATEGORY;

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);

    const budgetedZar = Number(formData.get("budgetedZar"));
    let name = String(formData.get("category") ?? "");

    if (name === NEW_CATEGORY) {
      const newName = String(formData.get("newCategory") ?? "").trim();
      const kind = String(formData.get("newCategoryKind") ?? "expense");
      const created = await createCategory({
        name: newName,
        kind: kind as "expense" | "income" | "transfer" | "contribution",
      });
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
      title="Add a budget line"
      description={`Applies to ${cycleLabel}. Past cycles stay as they were.`}
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
          <>
            <Field label="New category name" hint="Appears in the log sheet straight away.">
              <input
                name="newCategory"
                required
                autoComplete="off"
                className={inputClass}
                placeholder="School fees"
              />
            </Field>
            <Field label="Kind">
              <select name="newCategoryKind" className={inputClass} defaultValue="expense">
                <option value="expense">Expense — money out</option>
                <option value="income">Income — money in</option>
                <option value="contribution">Contribution — money put away</option>
                <option value="transfer">Transfer — money moved</option>
              </select>
            </Field>
          </>
        ) : null}

        <Field label="Monthly amount" hint="Change it any time by tapping it on the list.">
          <input
            name="budgetedZar"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            required
            className={inputClass}
            placeholder="0.00"
          />
        </Field>

        {error ? <p className="mt-1 text-xs text-loss">{error}</p> : null}
      </form>
    </SlideOver>
  );
}
