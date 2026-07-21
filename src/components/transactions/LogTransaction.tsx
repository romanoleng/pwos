"use client";

import { useState } from "react";

import { createTransaction, voidTransaction } from "@/app/actions/transactions";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { toLocalISODate } from "@/lib/crypto/history";

/**
 * Daily transaction entry (CLAUDE.md §5).
 *
 * The highest-frequency action in the app, so it's built for speed: two taps
 * for direction, a positive amount (no remembering a minus sign), and today's
 * date pre-filled in Johannesburg time.
 */

/** The accounts worth logging against day to day, in likelihood order. */
const ACCOUNT_OPTIONS = [
  "Capitec Main",
  "GOtyme Bank",
  "TymeBank",
  "ABSA",
  "Capitec Business",
  "Capitec Savings",
  "Cash",
];

/**
 * A short list beats 48. These are the categories that actually recur, and
 * each maps to a budget line — see CATEGORY_TO_BUDGET.
 */
const EXPENSE_CATEGORIES = [
  "Groceries",
  "Petrol",
  "Eating Out",
  "Subscriptions",
  "Kids",
  "Medical",
  "Clothing & Shoes",
  "Home Maintenance",
  "Electricity",
  "Municipal Rates",
  "Store Account Payments",
  "Debt Repayment",
  "Bank Fees",
  "Smokes",
  "Betting/Lottery",
  "Miscellaneous",
];

const IN_CATEGORIES = ["Business Income", "Interest", "Allowance", "Transfer"];

const MOVE_CATEGORIES = ["Transfer", "Savings", "Investments", "Crypto Investment"];

export function LogTransaction({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories =
    direction === "out"
      ? [...EXPENSE_CATEGORIES, ...MOVE_CATEGORIES]
      : [...IN_CATEGORIES, ...MOVE_CATEGORIES];

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);

    const result = await createTransaction({
      description: String(formData.get("description") ?? ""),
      amountZar: Number(formData.get("amount")),
      direction,
      category: String(formData.get("category") ?? ""),
      account: String(formData.get("account") ?? ""),
      date: String(formData.get("date") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const recordId = result.data.recordId;
    onClose();
    onSaved();
    toast.show({
      message: "Logged",
      tone: "success",
      onUndo: async () => {
        const undone = await voidTransaction(recordId);
        onSaved();
        toast.show(
          undone.ok
            ? { message: "Entry voided", tone: "neutral" }
            : { message: `Couldn't undo: ${undone.error}`, tone: "error" },
        );
      },
    });
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Log a transaction"
      description="Writes straight to your Airtable ledger."
    >
      <form action={onSubmit}>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <DirectionButton
            active={direction === "out"}
            onClick={() => setDirection("out")}
            label="Money out"
          />
          <DirectionButton
            active={direction === "in"}
            onClick={() => setDirection("in")}
            label="Money in"
          />
        </div>

        <Field label="Amount (ZAR)" hint="Just the number — the direction sets the sign.">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            autoFocus
            inputMode="decimal"
            className={`${inputClass} text-lg tabular-nums`}
            placeholder="0,00"
          />
        </Field>

        <Field label="Description">
          <input
            name="description"
            required
            autoComplete="off"
            className={inputClass}
            placeholder="Checkers Sixty60"
          />
        </Field>

        <Field label="Category">
          <select name="category" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Pick one…
            </option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Account">
          <select name="account" required className={inputClass} defaultValue="Capitec Main">
            {ACCOUNT_OPTIONS.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Date">
          <input
            name="date"
            type="date"
            defaultValue={toLocalISODate(new Date())}
            className={inputClass}
          />
        </Field>

        <Field label="Notes">
          <textarea
            name="notes"
            rows={2}
            className={`${inputClass} h-auto py-2`}
            placeholder="Optional"
          />
        </Field>

        {error ? (
          <p role="alert" className="mb-3 text-xs text-loss">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Logging…" : "Log it"}
        </button>
      </form>
    </SlideOver>
  );
}

function DirectionButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 rounded-lg border text-sm transition-colors ${
        active
          ? "border-accent/50 bg-accent/15 text-ink"
          : "border-line text-muted hover:border-line-2 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
