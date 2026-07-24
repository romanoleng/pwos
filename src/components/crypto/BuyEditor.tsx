"use client";

import { useState } from "react";
import useSWR from "swr";

import { logCryptoBuy } from "@/app/actions/cryptoBuy";
import { AmountInput } from "@/components/ui/AmountInput";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { parseAmount } from "@/lib/amount";
import type { HomeSummary } from "@/lib/server/home";

/**
 * Log a crypto buy as an event (coins in, cash out, dated) — see
 * app/actions/cryptoBuy.ts. Adds to the existing position, so there's no
 * hand-calculated total.
 */
export function BuyEditor({
  open,
  onClose,
  onSaved,
  knownWallets,
  knownSymbols,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  knownWallets: string[];
  knownSymbols: string[];
}) {
  const toast = useToast();
  const { data: home } = useSWR<HomeSummary>("/api/home?period=cycle", (url: string) =>
    fetch(url).then((r) => r.json()),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accounts = (home?.cards ?? []).map((c) => c.label);

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);
    const quantity = parseAmount(String(formData.get("quantity") ?? "")) ?? Number.NaN;
    const randSpent = parseAmount(String(formData.get("randSpent") ?? "")) ?? Number.NaN;
    const fromAccount = String(formData.get("fromAccount") ?? "");

    const result = await logCryptoBuy({
      symbol: String(formData.get("symbol") ?? ""),
      coin: String(formData.get("coin") ?? "") || undefined,
      wallet: String(formData.get("wallet") ?? ""),
      quantity,
      randSpent,
      fromAccount: fromAccount || undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    onSaved();
    toast.show({
      message: result.data.deducted
        ? `Logged your ${result.data.symbol} buy · cash deducted`
        : `Logged your ${result.data.symbol} buy`,
      tone: "success",
    });
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Log a buy"
      description="Enter what you bought — it adds to your position and records where the money came from."
      footer={
        <button
          type="submit"
          form="crypto-buy-form"
          disabled={saving}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Logging…" : "Log the buy"}
        </button>
      }
    >
      <form action={onSubmit} id="crypto-buy-form">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coin">
            <input
              name="symbol"
              required
              autoComplete="off"
              list="crypto-symbols"
              placeholder="HBAR"
              className={`${inputClass} uppercase`}
            />
            <datalist id="crypto-symbols">
              {knownSymbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Wallet">
            <select name="wallet" className={inputClass} defaultValue={knownWallets[0] ?? "EasyCrypto"}>
              {(knownWallets.length > 0 ? knownWallets : ["EasyCrypto"]).map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Coins bought" hint="How many of this coin you bought.">
          <AmountInput name="quantity" required placeholder="0,00" />
        </Field>

        <Field label="Rand spent" hint="What you paid, including fees.">
          <AmountInput name="randSpent" required placeholder="0,00" />
        </Field>

        <Field label="Paid from" hint="The account the money came from — it's deducted and recorded.">
          <select name="fromAccount" className={inputClass} defaultValue="">
            <option value="">Don&apos;t track the cash</option>
            {accounts.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Coin name" hint="Optional — only needed the first time.">
          <input name="coin" autoComplete="off" placeholder="Hedera" className={inputClass} />
        </Field>

        {error ? <p className="mt-1 text-xs text-loss">{error}</p> : null}
      </form>
    </SlideOver>
  );
}
