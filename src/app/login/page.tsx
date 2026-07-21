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
      <div className="w-full max-w-[20rem]">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent/15 text-xs font-semibold tracking-tight text-accent">
            P
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">PWOS</p>
            <p className="text-xs text-muted">Personal Wealth Operating System</p>
          </div>
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
