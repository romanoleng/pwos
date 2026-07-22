import type { Metadata } from "next";

import { LoginForm } from "@/app/login/LoginForm";
import { isAuthConfigured } from "@/lib/server/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  // Next 16: request-time APIs are async (see AGENTS.md / upgrading guide).
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const configured = isAuthConfigured();

  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-[21rem]">
        {/* Centred and given room to breathe: this is the one screen seen
            before any data loads, so it sets the tone for the whole app. */}
        <div className="mb-9 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent/15 text-base font-semibold tracking-tight text-accent">
            ML
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Mr Leng</h1>
          <p className="mt-1 text-sm text-muted">Personal Wealth Operating System</p>
        </div>

        {configured ? (
          <LoginForm next={next} />
        ) : (
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-medium">Not configured yet</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Set <code className="text-ink">AUTH_SECRET</code> and{" "}
              <code className="text-ink">APP_PASSWORD</code> in{" "}
              <code className="text-ink">.env.local</code>, then restart the dev
              server. See <code className="text-ink">.env.example</code>.
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-faint">Private. Single user.</p>
      </div>
    </main>
  );
}
