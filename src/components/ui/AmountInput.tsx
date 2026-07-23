"use client";

import { useRef, useState } from "react";

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
 * is lost by the change — EXCEPT the minus key, which that keypad simply does
 * not have. Fields that may legitimately go negative (an account in arrears)
 * set `allowNegative`, which adds a ± button beside the input; everything else
 * stays a bare input and can't grow a stray sign.
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
  /**
   * React applies autoFocus imperatively without rendering the attribute, so
   * SlideOver's focus pass can't see it. The data attribute makes the intent
   * visible in the DOM — SlideOver focuses [data-autofocus] first.
   */
  autoFocus,
  allowNegative = false,
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
  /** Shows the ± button — the phone's decimal keypad has no minus key. */
  allowNegative?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Sign state for the uncontrolled case, so the button can still tint red;
  // controlled usage derives it from `value` and this stays untouched.
  const [uncontrolledNegative, setUncontrolledNegative] = useState(() =>
    String(defaultValue ?? "").trim().startsWith("-"),
  );
  const negative =
    value !== undefined ? value.trim().startsWith("-") : uncontrolledNegative;

  function flipSign() {
    const current =
      value !== undefined ? value : (inputRef.current?.value ?? "");
    const next = current.trim().startsWith("-")
      ? current.replace("-", "")
      : `-${current.trim()}`;
    if (onChange) {
      onChange(next);
    } else if (inputRef.current) {
      inputRef.current.value = next;
    }
    setUncontrolledNegative(next.trim().startsWith("-"));
  }

  const field = (
    <input
      ref={inputRef}
      name={name}
      type="text"
      inputMode="decimal"
      // Both separators, an optional leading R, and spaces for thousands.
      // Advisory only — parseAmount is what actually decides.
      pattern="[0-9\s.,\-Rr]*"
      autoComplete="off"
      defaultValue={defaultValue}
      value={value}
      onChange={
        onChange
          ? (event) => onChange(event.target.value)
          : allowNegative
            ? (event) => setUncontrolledNegative(event.target.value.trim().startsWith("-"))
            : undefined
      }
      required={required}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      data-autofocus={autoFocus ? "true" : undefined}
      // Wrapped, the default top margin moves to the wrapper so the ± button
      // lines up with the input instead of floating above it.
      className={className ?? (allowNegative ? inputClass.replace("mt-1.5 ", "") : inputClass)}
    />
  );

  if (!allowNegative) return field;

  return (
    <span
      className={`flex min-w-0 shrink-0 items-stretch gap-1 ${className ? "" : "mt-1.5"}`}
    >
      <button
        type="button"
        aria-label="Flip sign"
        title="Flip sign"
        // preventDefault keeps focus (and the keypad) on the input.
        onPointerDown={(event) => event.preventDefault()}
        onClick={flipSign}
        className={`w-8 shrink-0 self-stretch rounded-lg border text-sm ${
          negative
            ? "border-loss/50 bg-loss/10 text-loss"
            : "border-line text-muted hover:border-line-2 hover:text-ink"
        }`}
      >
        ±
      </button>
      {field}
    </span>
  );
}
