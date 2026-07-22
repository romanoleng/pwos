"use client";

import { AlertTriangle, Repeat as RepeatIcon } from "lucide-react";
import { useState } from "react";

import {
  createTransaction,
  createTransactionSeries,
  deleteTransaction,
  restoreTransaction,
  updateTransaction,
} from "@/app/actions/transactions";
import { MAX_MONTHS, MIN_MONTHS, type ScheduleMode } from "@/lib/schedule";
import { AmountInput } from "@/components/ui/AmountInput";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { toLocalISODate } from "@/lib/crypto/history";
import { formatMoneyWhole } from "@/lib/format";
import { parseAmount } from "@/lib/amount";
import { destinationFrom, isMoveCategory } from "@/lib/transactions";

/**
 * Transaction entry (CLAUDE.md §5).
 *
 * The highest-frequency action in the app, so it is built for speed: two taps
 * for direction, a positive amount, today's date pre-filled in Johannesburg
 * time, and one-tap chips for the categories actually used recently.
 */

/** Fallbacks only — the real lists come from the database via props. */
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
  accounts = [],
  allCategories = [],
  kidAccounts = [],
  suggestsNewCycle = false,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultAccount?: string;
  suggestedCategories?: string[];
  /** Past descriptions, offered as autocomplete so common ones are one tap. */
  recentDescriptions?: string[];
  /** Real accounts from the database, so this list can never drift from it. */
  accounts?: { label: string; kind: string }[];
  /** Every category from the database, split by kind for the right mode. */
  allCategories?: { name: string; kind: string }[];
  /** Lisa's and Liam's accounts, offered as transfer destinations. */
  kidAccounts?: { id: string; child: string | null; account: string }[];
  /**
   * Whether the current cycle has run long enough that income probably opens a
   * new one. Decided on the server, which knows both dates.
   */
  suggestsNewCycle?: boolean;
  /** When present the sheet edits this entry instead of creating one. */
  editing?: EditingTransaction;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState<"out" | "in" | "move">(
    editing
      ? isMoveCategory(editing.category) ? "move" : editing.amountZar < 0 ? "out" : "in"
      : "out",
  );
  const [category, setCategory] = useState(editing?.category ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [pending, setPending] = useState<FormData | null>(null);
  // Rep/Inst. (reference pattern, 2026-07-22): one submission can become a
  // monthly series. "once" is the default and the only mode while editing.
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("once");
  const [scheduleMonths, setScheduleMonths] = useState(3);
  const [scheduleSheet, setScheduleSheet] = useState(false);

  const wantKind =
    direction === "move" ? ["transfer", "contribution"] : direction === "out" ? ["expense"] : ["income"];
  const fromDb = allCategories.filter((c) => wantKind.includes(c.kind)).map((c) => c.name);
  const categories = fromDb.length > 0 ? fromDb : MOVE_CATEGORY_OPTIONS;

  // Pinned categories, in the order set in the database.
  const chips = suggestedCategories.filter((c) => categories.includes(c)).slice(0, 8);

  // A transfer needs somewhere to land — §5 requires both legs to move.
  const needsDestination = direction === "move";
  const accountOptions = accounts.length > 0 ? accounts.map((a) => a.label) : [];

  function reset() {
    setCategory("");
    setDuplicate(null);
    setPending(null);
    setError(null);
    setScheduleMode("once");
    setScheduleMonths(3);
    setScheduleSheet(false);
  }

  async function submit(formData: FormData, confirmDuplicate: boolean) {
    setSaving(true);
    setError(null);

    const chosenCategory = category || String(formData.get("category") ?? "");
    const payload = {
      description: String(formData.get("description") ?? ""),
      amountZar: parseAmount(String(formData.get("amount") ?? "")) ?? Number.NaN,
      direction: direction === "move" ? "out" : direction,
      category: chosenCategory || "Transfer",
      account: String(formData.get("account") ?? ""),
      ...destinationFrom(String(formData.get("toAccount") ?? "")),
      startsCycle: formData.get("startsCycle") === "on",
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

    // A repeat or instalment becomes a whole series server-side — one call,
    // one database transaction, every entry or none.
    if (scheduleMode !== "once") {
      const series = await createTransactionSeries({
        description: payload.description,
        amountZar: payload.amountZar,
        direction: direction === "in" ? "in" : "out",
        category: payload.category,
        account: payload.account,
        date: payload.date,
        notes: payload.notes,
        schedule: { mode: scheduleMode, months: scheduleMonths },
      });
      setSaving(false);
      if (!series.ok) {
        setError(series.error);
        return;
      }

      const { recordIds, count, monthlyZar, balanceMoved, warning } = series.data;
      reset();
      onClose();
      onSaved();
      const noun = scheduleMode === "instalment" ? "instalments" : "months";
      const parts = [
        `${count} ${noun} of ${formatMoneyWhole(monthlyZar)}`,
        balanceMoved
          ? `${balanceMoved.accountLabel} now ${formatMoneyWhole(balanceMoved.newBalanceZar)}`
          : null,
      ].filter(Boolean);
      toast.show({
        message: `Logged · ${parts.join(" · ")}`,
        tone: "success",
        onUndo: async () => {
          // The whole series goes, newest first; each future entry knows its
          // balance never moved, so nothing is falsely refunded.
          for (const id of [...recordIds].reverse()) {
            await deleteTransaction(id);
          }
          onSaved();
          toast.show({ message: `Removed all ${count} entries`, tone: "neutral" });
        },
      });
      if (warning) toast.show({ message: warning, tone: "error", durationMs: 9000 });
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
      // Full screen on mobile so the whole form is one view, no scrolling —
      // the point of entry-at-the-till is seeing everything at once.
      fullScreen
      onClose={() => {
        reset();
        onClose();
      }}
      title={editing ? "Edit entry" : direction === "move" ? "Move money" : "Log a transaction"}
      description={
        editing
          ? "Balances are adjusted to match the change."
          : "Writes straight to your ledger and moves the account."
      }
    >
      {/* min-h-full + the mt-auto tail pins "Log it" to the bottom of the
          screen, so the layout reads as designed-for-the-space rather than a
          short form floating in a tall sheet. */}
      <form
        action={(formData) => submit(formData, false)}
        className="flex min-h-full flex-col"
      >
        <div className="mb-4 grid grid-cols-3 gap-2">
          <DirectionButton
            active={direction === "out"}
            onClick={() => { setDirection("out"); setCategory(""); }}
            label="Spent"
          />
          <DirectionButton
            active={direction === "in"}
            onClick={() => { setDirection("in"); setCategory(""); }}
            label="Received"
          />
          <DirectionButton
            active={direction === "move"}
            onClick={() => {
              setDirection("move");
              setCategory("Transfer");
              // A repeating transfer needs both legs scheduled — not built yet.
              setScheduleMode("once");
            }}
            label="Transfer"
          />
        </div>

        {/* No hint line — the direction buttons above already say what the
            sign will be, and every saved line matters for the one-view goal. */}
        <Field label="Amount (ZAR)">
          <AmountInput
            name="amount"
            required
            autoFocus
            defaultValue={editing ? Math.abs(editing.amountZar) : ""}
            className={`${inputClass} h-14 text-2xl tabular-nums`}
            placeholder="0,00"
          />
        </Field>

        <Field label={direction === "move" ? "What for" : "Description"}>
          <input
            name="description"
            required
            autoComplete="off"
            list="pwos-descriptions"
            defaultValue={editing?.description ?? ""}
            className={inputClass}
            placeholder={direction === "move" ? "Moving to savings" : "Checkers Sixty60"}
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

        {/* Account and date share a row — both are usually the smart default
            (main account, today), so neither earns a full line of its own. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label={needsDestination ? "From account" : "Account"}>
            <select
              name="account"
              required
              className={inputClass}
              defaultValue={
                editing?.accountLabel && accountOptions.includes(editing.accountLabel)
                  ? editing.accountLabel
                  : defaultAccount && accountOptions.includes(defaultAccount)
                    ? defaultAccount
                    : accountOptions[0]
              }
            >
              {accountOptions.map((account) => (
                <option key={account} value={account}>
                  {account}
                </option>
              ))}
            </select>
          </Field>

          {/* Not a <label>: the Rep/Inst button lives in the heading row, and
              inside a label its taps would also activate the date input. */}
          <div className="mb-4">
            <span className="flex items-center justify-between text-xs font-medium text-muted">
              <span>Date</span>
              {!editing && direction !== "move" ? (
                <button
                  type="button"
                  onClick={() => setScheduleSheet(true)}
                  aria-haspopup="dialog"
                  className={`-my-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors ${
                    scheduleMode === "once"
                      ? "text-faint hover:text-ink"
                      : "bg-accent/15 font-medium text-accent"
                  }`}
                >
                  <RepeatIcon size={11} strokeWidth={2} />
                  {scheduleMode === "once"
                    ? "Once"
                    : scheduleMode === "repeat"
                      ? `Repeats × ${scheduleMonths}`
                      : `Instalments ÷ ${scheduleMonths}`}
                </button>
              ) : null}
            </span>
            <input
              name="date"
              type="date"
              defaultValue={editing?.date?.slice(0, 10) ?? toLocalISODate(new Date())}
              className={inputClass}
            />
          </div>
        </div>

        {direction === "in" && !editing && scheduleMode === "once" ? (
          <label className="mt-1 flex items-start gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <input
              type="checkbox"
              name="startsCycle"
              defaultChecked={suggestsNewCycle}
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium">Start a new budget cycle here</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">
                {suggestsNewCycle
                  ? "It's been a while since the last one, so this looks like the month's income."
                  : "Leave this off for a top-up — the cycle you're in keeps running."}
              </span>
            </span>
          </label>
        ) : null}

        {needsDestination && !editing ? (
          <Field
            label="To account"
            hint="Both sides move: this one is credited as the other is debited."
          >
            <select name="toAccount" className={inputClass} defaultValue="" required>
              <option value="" disabled>
                Where is it going?
              </option>
              {accountOptions.map((account) => (
                <option key={account} value={`account:${account}`}>
                  {account}
                </option>
              ))}
              {kidAccounts.length > 0 ? (
                <optgroup label="Lisa &amp; Liam">
                  {kidAccounts.map((kid) => (
                    <option key={kid.id} value={`kid:${kid.id}`}>
                      {[kid.child, kid.account].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </Field>
        ) : null}

        <Field label="Notes">
          {/* One line, not a textarea — notes here are "ref 88765", not prose,
              and the saved height keeps the whole form on one screen. */}
          <input
            name="notes"
            defaultValue={editing?.notes ?? ""}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>

        <div className="mt-auto pt-2">
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
            className="h-12 w-full rounded-lg bg-accent text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 md:h-10"
          >
            {saving
              ? "Saving…"
              : editing
                ? "Save changes"
                : scheduleMode === "repeat"
                  ? `Log ${scheduleMonths} months`
                  : scheduleMode === "instalment"
                    ? `Log ${scheduleMonths} instalments`
                    : "Log it"}
          </button>
        ) : null}
        </div>
      </form>

      {scheduleSheet ? (
        <SchedulePicker
          mode={scheduleMode}
          months={scheduleMonths}
          direction={direction === "in" ? "in" : "out"}
          onPick={(mode, months) => {
            setScheduleMode(mode);
            setScheduleMonths(months);
            setScheduleSheet(false);
          }}
          onClose={() => setScheduleSheet(false)}
        />
      ) : null}
    </SlideOver>
  );
}

/**
 * The small sheet the Rep/Inst. button pops (straight from the reference app:
 * Installment / Repeat / Cancel), adapted to en-ZA and to how each mode
 * treats the amount — that difference is the whole reason two modes exist,
 * so each option says it in its own words.
 */
function SchedulePicker({
  mode,
  months,
  direction,
  onPick,
  onClose,
}: {
  mode: ScheduleMode;
  months: number;
  direction: "out" | "in";
  onPick: (mode: ScheduleMode, months: number) => void;
  onClose: () => void;
}) {
  const [draftMode, setDraftMode] = useState<ScheduleMode>(mode);
  const [draftMonths, setDraftMonths] = useState(months);

  const clamp = (value: number) =>
    Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, Math.trunc(value) || MIN_MONTHS));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Repeat or instalment">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-[backdrop-in_150ms_ease-out] bg-black/50"
      />
      <div className="pb-safe absolute inset-x-0 bottom-0 animate-[sheet-up_240ms_cubic-bezier(0.32,0.72,0,1)] rounded-t-2xl border-t border-line-2 bg-surface p-4 md:mx-auto md:max-w-md">
        <ModeRow
          label="Once"
          hint="Just this entry."
          active={draftMode === "once"}
          onClick={() => onPick("once", draftMonths)}
        />
        <ModeRow
          label="Repeat monthly"
          hint={
            direction === "in"
              ? "This amount arrives every month — salary, rental income."
              : "This amount leaves every month — rent, subscriptions."
          }
          active={draftMode === "repeat"}
          onClick={() => setDraftMode("repeat")}
        />
        <ModeRow
          label="Instalment"
          hint="Split this amount over the months — Payflex, lay-by."
          active={draftMode === "instalment"}
          onClick={() => setDraftMode("instalment")}
        />

        {draftMode !== "once" ? (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs font-medium text-muted">
              {draftMode === "repeat" ? "For how many months?" : "Over how many months?"}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              {[3, 6, 12, 24].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDraftMonths(preset)}
                  className={`h-9 flex-1 rounded-lg border text-sm transition-colors ${
                    draftMonths === preset
                      ? "border-accent/50 bg-accent/15 text-ink"
                      : "border-line text-muted"
                  }`}
                >
                  {preset}
                </button>
              ))}
              <input
                type="number"
                min={MIN_MONTHS}
                max={MAX_MONTHS}
                value={draftMonths}
                onChange={(event) => setDraftMonths(clamp(Number(event.target.value)))}
                aria-label="Months"
                className="tnum h-9 w-16 rounded-lg border border-line bg-surface-2 px-2 text-center text-base outline-none focus:border-accent sm:text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => onPick(draftMode, clamp(draftMonths))}
              className="mt-3 h-11 w-full rounded-lg bg-accent text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 h-11 w-full rounded-lg border border-line text-sm text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ModeRow({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`mb-1.5 block w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
        active ? "border-accent/50 bg-accent/10" : "border-line hover:border-line-2"
      }`}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-faint">{hint}</span>
    </button>
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
