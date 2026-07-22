"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { confirmReveal } from "@/app/actions/privacy";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { setValuesHidden, useValuesHidden } from "@/lib/privacy";

/**
 * The privacy eye (Romano: "showcase to someone but not show values").
 *
 * One tap hides every amount, coin and holding name across the app —
 * percentages stay, so the shape still demos. Revealing asks for the app
 * password: handing the phone over doesn't hand over the numbers, and there's
 * no second PIN to remember because the password already proves it's him.
 */
export function PrivacyToggle() {
  const hidden = useValuesHidden();
  const [asking, setAsking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setChecking(true);
    setError(null);
    const result = await confirmReveal(String(formData.get("password") ?? ""));
    setChecking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValuesHidden(false);
    setAsking(false);
  }

  return (
    <>
      <button
        type="button"
        aria-label={hidden ? "Reveal amounts" : "Hide amounts"}
        aria-pressed={hidden}
        title={hidden ? "Amounts hidden — tap to reveal" : "Hide all amounts"}
        onClick={() => {
          if (hidden) setAsking(true);
          else setValuesHidden(true);
        }}
        className={`rounded-lg p-1.5 transition-colors hover:bg-surface-2 ${
          hidden ? "text-accent" : "text-muted hover:text-ink"
        }`}
      >
        {hidden ? (
          <EyeOff size={17} strokeWidth={1.75} />
        ) : (
          <Eye size={17} strokeWidth={1.75} />
        )}
      </button>

      <SlideOver
        open={asking}
        onClose={() => setAsking(false)}
        title="Reveal amounts"
        description="Hiding is one tap. Revealing proves it's you."
        footer={
          <button
            type="submit"
            form="reveal-form"
            disabled={checking}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {checking ? "Checking…" : "Reveal"}
          </button>
        }
      >
        <form action={onSubmit} id="reveal-form">
          <Field label="App password">
            <input
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              className={inputClass}
            />
          </Field>
          {error ? <p className="mt-1 text-xs text-loss">{error}</p> : null}
        </form>
      </SlideOver>
    </>
  );
}
