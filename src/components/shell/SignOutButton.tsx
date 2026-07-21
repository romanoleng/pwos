"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { signOut } from "@/app/actions/auth";

export function SignOutButton({ className = "" }: { className?: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void signOut())}
      aria-label="Sign out"
      title="Sign out"
      className={`inline-flex size-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-2 hover:text-ink disabled:opacity-50 ${className}`}
    >
      <LogOut size={16} strokeWidth={1.75} />
    </button>
  );
}
