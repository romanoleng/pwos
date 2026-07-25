"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type SignInState } from "@/app/actions/auth";

const INITIAL: SignInState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 h-10 w-full rounded-lg bg-accent text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Checking…" : "Unlock"}
    </button>
  );
}

export function LoginForm({ next, twoFactor = false }: { next?: string; twoFactor?: boolean }) {
  const [state, formAction] = useActionState(signIn, INITIAL);

  return (
    <form action={formAction} noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label htmlFor="password" className="block text-xs font-medium text-muted">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        aria-describedby={state.error ? "login-error" : undefined}
        className="mt-1.5 h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
        placeholder="••••••••"
      />

      {twoFactor ? (
        <>
          <label htmlFor="code" className="mt-4 block text-xs font-medium text-muted">
            Authenticator code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm tracking-[0.3em] outline-none transition-colors placeholder:tracking-normal placeholder:text-faint focus:border-accent"
            placeholder="123 456"
          />
          <p className="mt-1.5 text-[11px] text-faint">
            The 6-digit code from your app — or a backup code if you don&apos;t have it.
          </p>
        </>
      ) : null}

      {state.error ? (
        <p id="login-error" role="alert" className="mt-2.5 text-xs text-loss">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
