"use client";

import { useState } from "react";

import {
  createHolding,
  restoreHolding,
  setHoldingArchived,
  updateHolding,
  type HoldingSnapshot,
} from "@/app/actions/holdings";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { parseAmount } from "@/lib/amount";
import { WALLET_ORDER } from "@/lib/constants";
import type { Holding } from "@/lib/crypto/types";

type Mode =
  | { kind: "edit"; holding: Holding }
  | { kind: "add"; wallet?: string };

export function HoldingEditor({
  mode,
  open,
  onClose,
  onSaved,
  knownWallets,
}: {
  mode: Mode;
  open: boolean;
  onClose: () => void;
  /** Called after a successful write so the caller can revalidate. */
  onSaved: () => void;
  knownWallets: string[];
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = mode.kind === "edit" ? mode.holding : null;

  // Wallet list is the union of what's configured and what's actually in the
  // data — Holdings contains wallets the spec never listed (Tangem Cold Wallet).
  const wallets = [...new Set([...knownWallets, ...WALLET_ORDER])];

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);

    // Text inputs now, so the comma decimal survives — see lib/amount.ts.
    const quantity = parseAmount(String(formData.get("quantity") ?? "")) ?? Number.NaN;
    const investedZar = parseAmount(String(formData.get("investedZar") ?? "")) ?? Number.NaN;
    const wallet = String(formData.get("wallet") ?? "");
    const notes = String(formData.get("notes") ?? "");

    if (editing) {
      const result = await updateHolding(editing.recordId, {
        quantity,
        investedZar,
        wallet,
        notes,
      });
      setSaving(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const previous: HoldingSnapshot = result.data.previous;
      onClose();
      onSaved();
      toast.show({
        message: `${editing.symbol} updated`,
        tone: "success",
        onUndo: async () => {
          const undone = await restoreHolding(previous);
          onSaved();
          toast.show(
            undone.ok
              ? { message: `${editing.symbol} restored`, tone: "neutral" }
              : { message: `Couldn't undo: ${undone.error}`, tone: "error" },
          );
        },
      });
      return;
    }

    const symbol = String(formData.get("symbol") ?? "");
    const result = await createHolding({ symbol, wallet, quantity, investedZar, notes });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    onSaved();
    // No undo offered: undoing a create means deleting, and §9b keeps deletion
    // out of the fast path. An unwanted row can be edited or archived instead.
    toast.show({ message: `${symbol.toUpperCase()} added`, tone: "success" });
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.symbol}` : "Add a holding"}
      description={
        editing
          ? "Positions are the source of truth. Prices stay live."
          : "Logs a new position."
      }
    >
      <form action={onSubmit} id="holding-form">
        {!editing ? (
          <Field label="Symbol" hint="e.g. BTC, ETH, HBAR">
            <input
              name="symbol"
              required
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} uppercase`}
              placeholder="BTC"
            />
          </Field>
        ) : null}

        <Field label="Wallet">
          <select
            name="wallet"
            defaultValue={mode.kind === "edit" ? mode.holding.wallet : mode.wallet}
            className={inputClass}
            required
          >
            {wallets.map((wallet) => (
              <option key={wallet} value={wallet}>
                {wallet}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Quantity" hint="How many coins you hold.">
          <input
            name="quantity"
            type="text"
            inputMode="decimal"
            required
            defaultValue={editing?.quantity ?? ""}
            className={inputClass}
            placeholder="0"
          />
        </Field>

        <Field label="Total invested (ZAR)" hint="Your cost basis, not the current value.">
          <input
            name="investedZar"
            type="text"
            inputMode="decimal"
            required
            defaultValue={editing?.investedZar ?? ""}
            className={inputClass}
            placeholder="0"
          />
        </Field>

        <Field label="Notes">
          <textarea
            name="notes"
            rows={3}
            className={`${inputClass} h-auto py-2`}
            placeholder="Optional"
          />
        </Field>

        {error ? (
          <p role="alert" className="mb-3 text-xs text-loss">
            {error}
          </p>
        ) : null}

        {editing ? (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const result = await setHoldingArchived(editing.recordId, true);
              setSaving(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onClose();
              onSaved();
              toast.show({
                message: `${editing.symbol} archived`,
                onUndo: async () => {
                  // Archiving is a checkbox, so undo is simply unticking it.
                  await setHoldingArchived(editing.recordId, false);
                  onSaved();
                  toast.show({ message: `${editing.symbol} restored`, tone: "neutral" });
                },
              });
            }}
            className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-xs text-muted transition-colors hover:border-loss/40 hover:text-loss disabled:opacity-60"
          >
            Archive this position
          </button>
        ) : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="h-10 flex-1 rounded-lg bg-accent text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add holding"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 rounded-lg border border-line px-4 text-sm text-muted transition-colors hover:text-ink disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    </SlideOver>
  );
}
