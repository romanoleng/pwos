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

export function LoginForm({ next }: { next?: string }) {
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

      {state.error ? (
        <p id="login-error" role="alert" className="mt-2.5 text-xs text-loss">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
