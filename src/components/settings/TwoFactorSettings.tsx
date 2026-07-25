"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";

import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  startTwoFactorSetup,
} from "@/app/actions/twofactor";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { EnrollmentStart } from "@/lib/server/twofactor";

type Status = { enabled: boolean; backupRemaining: number };

async function fetcher(url: string): Promise<Status> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Couldn't load two-factor status.");
  return r.json();
}

/**
 * Two-factor (authenticator app) setup (Romano's ask, 2026-07-26). Scan the
 * QR, save the backup codes, confirm a code to turn it on. The secret and
 * codes are shown once, here, and never again.
 */
export function TwoFactorSettings() {
  const toast = useToast();
  const { data, mutate } = useSWR<Status>("/api/twofactor", fetcher, { revalidateOnFocus: false });
  const [setup, setSetup] = useState<EnrollmentStart | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);

  async function begin() {
    setBusy(true);
    const result = await startTwoFactorSetup();
    setBusy(false);
    if (!result.ok) return toast.show({ message: result.error, tone: "error" });
    setSetup(result.data);
    setCode("");
  }

  async function confirm() {
    setBusy(true);
    const result = await confirmTwoFactorSetup(code);
    setBusy(false);
    if (!result.ok) return toast.show({ message: result.error, tone: "error" });
    setSetup(null);
    setCode("");
    await mutate();
    toast.show({ message: "Two-factor is on. You'll need a code next time you sign in.", tone: "success" });
  }

  async function turnOff() {
    const entered = window.prompt("Enter a current authenticator code (or a backup code) to turn two-factor off:");
    if (entered === null) return;
    setDisabling(true);
    const result = await disableTwoFactor(entered);
    setDisabling(false);
    if (!result.ok) return toast.show({ message: result.error, tone: "error" });
    await mutate();
    toast.show({ message: "Two-factor turned off.", tone: "neutral" });
  }

  const enabled = data?.enabled ?? false;

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        description="A 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password), on top of your password."
      />
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${enabled ? "bg-gain" : "bg-faint"}`}
            />
            <span className="text-sm font-medium">{enabled ? "On" : "Off"}</span>
            {enabled ? (
              <span className="text-[11px] text-faint">· {data?.backupRemaining ?? 0} backup codes left</span>
            ) : null}
          </div>
          {enabled ? (
            <button
              type="button"
              onClick={turnOff}
              disabled={disabling}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-line-2 hover:text-ink disabled:opacity-60"
            >
              {disabling ? "…" : "Turn off"}
            </button>
          ) : setup ? null : (
            <button
              type="button"
              onClick={begin}
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "…" : "Set up"}
            </button>
          )}
        </div>

        {setup ? (
          <div className="space-y-4 border-t border-line pt-4">
            <Step n={1} title="Scan this in your authenticator app">
              <div className="flex items-center gap-4">
                <Image
                  src={setup.qrDataUrl}
                  alt="Two-factor QR code"
                  width={120}
                  height={120}
                  unoptimized
                  className="rounded-lg border border-line bg-white p-1"
                />
                <div className="min-w-0">
                  <p className="text-[11px] text-faint">Can&apos;t scan? Enter this key by hand:</p>
                  <code className="mt-1 block break-all font-mono text-[12px] text-ink">
                    {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
                  </code>
                </div>
              </div>
            </Step>

            <Step n={2} title="Save your backup codes">
              <p className="mb-2 text-[11px] leading-relaxed text-muted">
                Each works once, if you ever lose your phone. Keep them somewhere safe — they won&apos;t be shown again.
              </p>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px]">
                {setup.backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(setup.backupCodes.join("\n"));
                  toast.show({ message: "Backup codes copied.", tone: "neutral" });
                }}
                className="mt-2 text-[11px] font-medium text-accent hover:underline"
              >
                Copy all
              </button>
            </Step>

            <Step n={3} title="Enter a code to turn it on">
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123 456"
                  className="h-10 w-32 rounded-lg border border-line bg-surface-2 px-3 text-sm tracking-[0.2em] outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy || code.trim().length < 6}
                  className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "…" : "Turn on"}
                </button>
                <button
                  type="button"
                  onClick={() => setSetup(null)}
                  className="h-10 rounded-lg border border-line px-3 text-sm text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </Step>
          </div>
        ) : null}

        {!enabled && !setup ? (
          <p className="text-[11px] leading-relaxed text-faint">
            Strongly recommended now that the app is on a public address. Even if your password leaked, no one could sign in without your phone.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-[13px] font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}
