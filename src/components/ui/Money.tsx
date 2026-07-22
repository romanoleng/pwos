"use client";

import { useValuesHidden } from "@/lib/privacy";

import {
  directionOf,
  formatMoney,
  formatMoneyCompact,
  formatMoneySigned,
  formatMoneyWhole,
  formatPercent,
  formatPercentSigned,
  formatUnitPrice,
  type Currency,
} from "@/lib/format";

const TONE_CLASS = {
  gain: "text-gain",
  loss: "text-loss",
  flat: "text-muted",
} as const;

type MoneyVariant = "standard" | "whole" | "unit" | "compact";

type MoneyProps = {
  value: number;
  currency?: Currency;
  variant?: MoneyVariant;
  /** Prefix + / − and colour by direction. For deltas, not balances. */
  signed?: boolean;
  /** Force a tone; defaults to sign-derived when `signed`, otherwise none. */
  tone?: "gain" | "loss" | "flat" | "none";
  className?: string;
};

/**
 * Every monetary figure in the app renders through this. It guarantees
 * tabular figures (§6) so columns don't shift as prices tick, and keeps
 * gain/loss colouring consistent instead of ad hoc per screen.
 */
export function Money({
  value,
  currency = "ZAR",
  variant = "standard",
  signed = false,
  tone,
  className = "",
}: MoneyProps) {
  // Privacy mode: the amount becomes dots, the tone colour goes with it (a
  // red "R ••••" would still say "loss"), but percentages elsewhere stay —
  // Romano's ask was the shape without the substance.
  const valuesHidden = useValuesHidden();

  let text: string;
  if (signed) {
    text = formatMoneySigned(value, currency, variant === "whole" ? { decimals: 0 } : {});
  } else if (variant === "whole") {
    text = formatMoneyWhole(value, currency);
  } else if (variant === "unit") {
    text = formatUnitPrice(value, currency);
  } else if (variant === "compact") {
    text = formatMoneyCompact(value, currency);
  } else {
    text = formatMoney(value, currency);
  }

  if (valuesHidden) {
    return (
      <span aria-label="amount hidden" className={`tnum ${className}`.trim()}>
        R ••••
      </span>
    );
  }

  const resolvedTone = tone ?? (signed ? directionOf(value) : "none");
  const toneClass = resolvedTone === "none" ? "" : TONE_CLASS[resolvedTone];

  return <span className={`tnum ${toneClass} ${className}`.trim()}>{text}</span>;
}

/**
 * Masks identifying text — coin symbols, holding names, quantities — in
 * privacy mode. Values get "R ••••" via Money; identities get this.
 */
export function Sensitive({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const valuesHidden = useValuesHidden();
  if (valuesHidden) {
    return (
      <span aria-label="hidden" className={className}>
        •••
      </span>
    );
  }
  return <span className={className}>{children}</span>;
}

type PercentProps = {
  value: number;
  signed?: boolean;
  decimals?: number;
  tone?: "gain" | "loss" | "flat" | "none";
  className?: string;
};

export function Percent({
  value,
  signed = false,
  decimals = 1,
  tone,
  className = "",
}: PercentProps) {
  const text = signed
    ? formatPercentSigned(value, decimals)
    : formatPercent(value, decimals);
  const resolvedTone = tone ?? (signed ? directionOf(value) : "none");
  const toneClass = resolvedTone === "none" ? "" : TONE_CLASS[resolvedTone];

  return <span className={`tnum ${toneClass} ${className}`.trim()}>{text}</span>;
}
