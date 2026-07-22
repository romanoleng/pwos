"use client";

import { inputClass } from "@/components/ui/SlideOver";

/**
 * A money field that accepts the comma decimal (CLAUDE.md §7).
 *
 * Deliberately type="text" rather than type="number". A number input applies
 * the HTML value sanitisation algorithm, which only recognises a full stop as
 * the decimal separator — so on a South African keyboard, where the decimal key
 * is a comma, typing "50,50" left the field empty and the cents disappeared
 * without a word.
 *
 * inputMode="decimal" still brings up the numeric keypad on a phone, so nothing
 * is lost by the change.
 */
export function AmountInput({
  name,
  defaultValue,
  value,
  onChange,
  required,
  placeholder = "0,00",
  className,
  ariaLabel,
  autoFocus,
}: {
  name?: string;
  defaultValue?: string | number;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      name={name}
      type="text"
      inputMode="decimal"
      // Both separators, an optional leading R, and spaces for thousands.
      // Advisory only — parseAmount is what actually decides.
      pattern="[0-9\s.,\-Rr]*"
      autoComplete="off"
      defaultValue={defaultValue}
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      required={required}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      className={className ?? inputClass}
    />
  );
}
