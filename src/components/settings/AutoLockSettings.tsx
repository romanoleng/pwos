"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LOCK_MINUTES, setAutoLock, useAutoLock, type LockMode } from "@/lib/autolock";

const MODES: { key: LockMode; label: string; hint: string }[] = [
  { key: "hide", label: "Hide values", hint: "Mask the numbers; browse freely, reveal with your password." },
  { key: "lock", label: "Lock screen", hint: "Cover the app; your password (or Face ID) to carry on." },
  { key: "signout", label: "Sign out", hint: "End the session — full login, including 2FA, to return." },
];

function label(min: number): string {
  return min === 0 ? "Off" : `${min} min`;
}

/**
 * Auto-lock settings (Romano's ask, 2026-07-26). Per-device, saved locally.
 */
export function AutoLockSettings() {
  const prefs = useAutoLock();

  return (
    <Card>
      <CardHeader
        title="Auto-lock"
        description="Step away and the app protects itself after a while. Set per device — a phone and a home desktop can differ."
      />
      <CardBody className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
            Lock after
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LOCK_MINUTES.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setAutoLock({ ...prefs, minutes: min })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  prefs.minutes === min
                    ? "border-accent/50 bg-accent/15 text-ink"
                    : "border-line text-muted hover:border-line-2 hover:text-ink"
                }`}
              >
                {label(min)}
              </button>
            ))}
          </div>
        </div>

        <div className={prefs.minutes === 0 ? "pointer-events-none opacity-40" : ""}>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
            When idle
          </p>
          <div className="space-y-2">
            {MODES.map((m) => {
              const on = prefs.mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setAutoLock({ ...prefs, mode: m.key })}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    on ? "border-accent/50 bg-accent/10" : "border-line hover:border-line-2"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      on ? "border-accent" : "border-line-2"
                    }`}
                  >
                    {on ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-faint">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-faint">
          {prefs.minutes === 0
            ? "Off — the app never locks itself. Pick a time above to turn it on."
            : `Locks ${label(prefs.minutes).toLowerCase()} after you last touch it, on this device.`}
        </p>
      </CardBody>
    </Card>
  );
}
