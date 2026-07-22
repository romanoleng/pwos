"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import {
  createTransaction,
  deleteTransaction,
  restoreTransaction,
  updateTransaction,
} from "@/app/actions/transactions";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { toLocalISODate } from "@/lib/crypto/history";
import { formatMoneyWhole } from "@/lib/format";
import { isMoveCategory } from "@/lib/transactions";

/**
 * Transaction entry (CLAUDE.md §5).
 *
 * The highest-frequency action in the app, so it is built for speed: two taps
 * for direction, a positive amount, today's date pre-filled in Johannesburg
 * time, and one-tap chips for the categories actually used recently.
 */

const ACCOUNT_OPTIONS = [
  "Capitec Main",
  "GOtyme Bank",
  "TymeBank",
  "ABSA",
  "Capitec Business",
  "Capitec Savings",
  "Cash",
];

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

const MOVE_CATEGORY_OPTIONS = ["Transfer", "Savings", "Investments", "Crypto Investment"];

export type EditingTransaction = {
  recordId: string;
  description: string;
  amountZar: number;
  category: string | null;
  accountLabel: string | null;
  date: string | null;
  notes: string | null;
};

export function LogTransaction({
  open,
  onClose,
  onSaved,
  defaultAccount,
  suggestedCategories = [],
  recentDescriptions = [],
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultAccount?: string;
  suggestedCategories?: string[];
  /** Past descriptions, offered as autocomplete so common ones are one tap. */
  recentDescriptions?: string[];
  /** When present the sheet edits this entry instead of creating one. */
  editing?: EditingTransaction;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState<"out" | "in">(
    editing ? (editing.amountZar < 0 ? "out" : "in") : "out",
  );
  const [category, setCategory] = useState(editing?.category ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [pending, setPending] = useState<FormData | null>(null);

  const categories =
    direction === "out"
      ? [...EXPENSE_CATEGORIES, ...MOVE_CATEGORY_OPTIONS]
      : [...IN_CATEGORIES, ...MOVE_CATEGORY_OPTIONS];

  const chips = suggestedCategories.filter((c) => categories.includes(c)).slice(0, 6);

  // A transfer needs somewhere to land — §5 requires both legs to move.
  const needsDestination = isMoveCategory(category) && direction === "out";

  function reset() {
    setCategory("");
    setDuplicate(null);
    setPending(null);
    setError(null);
  }

  async function submit(formData: FormData, confirmDuplicate: boolean) {
    setSaving(true);
    setError(null);

    const chosenCategory = category || String(formData.get("category") ?? "");
    const payload = {
      description: String(formData.get("description") ?? ""),
      amountZar: Number(formData.get("amount")),
      direction,
      category: chosenCategory,
      account: String(formData.get("account") ?? ""),
      toAccount: String(formData.get("toAccount") ?? "") || undefined,
      date: String(formData.get("date") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    };

    if (editing) {
      const result = await updateTransaction(editing.recordId, payload);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      onClose();
      onSaved();
      toast.show({ message: "Entry updated", tone: "success" });
      if (result.data.warning) {
        toast.show({ message: result.data.warning, tone: "error", durationMs: 9000 });
      }
      return;
    }

    const result = await createTransaction({ ...payload, confirmDuplicate });
    setSaving(false);

    if ("kind" in result) {
      // Warn, don't block — two identical coffees in a day is a real thing.
      setDuplicate(result.message);
      setPending(formData);
      return;
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const { recordId, balanceMoved, destinationMoved, warning } = result.data;
    reset();
    onClose();
    onSaved();

    // Say what happened to the balance, not just "saved" — seeing the account
    // move is the confirmation that the entry did its job.
    const parts = [
      balanceMoved
        ? `${balanceMoved.accountLabel} now ${formatMoneyWhole(balanceMoved.newBalanceZar)}`
        : null,
      destinationMoved
        ? `${destinationMoved.accountLabel} now ${formatMoneyWhole(destinationMoved.newBalanceZar)}`
        : null,
    ].filter(Boolean);

    toast.show({
      message: parts.length > 0 ? `Logged · ${parts.join(" · ")}` : "Logged",
      tone: "success",
      onUndo: async () => {
        const undone = await deleteTransaction(recordId);
        onSaved();
        if (undone.ok) {
          const deleted = undone.data;
          toast.show({
            message: "Entry removed, balance restored",
            tone: "neutral",
            onUndo: async () => {
              await restoreTransaction(deleted);
              onSaved();
            },
          });
        } else {
          toast.show({ message: `Couldn't undo: ${undone.error}`, tone: "error" });
        }
      },
    });

    if (warning) toast.show({ message: warning, tone: "error", durationMs: 9000 });
  }

  return (
    <SlideOver
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={editing ? "Edit entry" : "Log a transaction"}
      description={
        editing
          ? "Balances are adjusted to match the change."
          : "Writes straight to your ledger and moves the account."
      }
    >
      <form action={(formData) => submit(formData, false)}>
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
            defaultValue={editing ? Math.abs(editing.amountZar) : ""}
            className={`${inputClass} h-14 text-2xl tabular-nums`}
            placeholder="0,00"
          />
        </Field>

        <Field label="Description">
          <input
            name="description"
            required
            autoComplete="off"
            list="pwos-descriptions"
            defaultValue={editing?.description ?? ""}
            className={inputClass}
            placeholder="Checkers Sixty60"
          />
          {/* Past descriptions as suggestions — the same shop gets typed a lot. */}
          <datalist id="pwos-descriptions">
            {recentDescriptions.map((description) => (
              <option key={description} value={description} />
            ))}
          </datalist>
        </Field>

        <Field label="Category">
          {chips.length > 0 ? (
            <div className="mb-2 mt-1.5 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  aria-pressed={category === chip}
                  onClick={() => setCategory(category === chip ? "" : chip)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    category === chip
                      ? "border-accent/50 bg-accent/15 text-ink"
                      : "border-line text-muted hover:border-line-2 hover:text-ink"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}
          <select
            name="category"
            required={!category}
            className={inputClass}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="" disabled>
              Pick one…
            </option>
            {categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label={needsDestination ? "From account" : "Account"}>
          <select
            name="account"
            required
            className={inputClass}
            defaultValue={
              editing?.accountLabel && ACCOUNT_OPTIONS.includes(editing.accountLabel)
                ? editing.accountLabel
                : defaultAccount && ACCOUNT_OPTIONS.includes(defaultAccount)
                  ? defaultAccount
                  : "Capitec Main"
            }
          >
            {ACCOUNT_OPTIONS.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
        </Field>

        {needsDestination && !editing ? (
          <Field
            label="To account"
            hint="Both sides move: this one is credited as the other is debited."
          >
            <select name="toAccount" className={inputClass} defaultValue="">
              <option value="">Not tracked here</option>
              {ACCOUNT_OPTIONS.map((account) => (
                <option key={account} value={account}>
                  {account}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Date">
          <input
            name="date"
            type="date"
            defaultValue={editing?.date?.slice(0, 10) ?? toLocalISODate(new Date())}
            className={inputClass}
          />
        </Field>

        <Field label="Notes">
          <textarea
            name="notes"
            rows={2}
            defaultValue={editing?.notes ?? ""}
            className={`${inputClass} h-auto py-2`}
            placeholder="Optional"
          />
        </Field>

        {duplicate ? (
          <div className="mb-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2.5">
            <p className="flex items-start gap-1.5 text-xs text-warn">
              <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
              {duplicate}
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => pending && submit(pending, true)}
                className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Logging…" : "Log it anyway"}
              </button>
              <button
                type="button"
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mb-3 text-xs text-loss">
            {error}
          </p>
        ) : null}

        {!duplicate ? (
          <button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Log it"}
          </button>
        ) : null}
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
