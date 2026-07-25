"use client";

import useSWR from "swr";

import { updateBriefPrefs, type BriefPrefsPatch } from "@/app/actions/brief";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { BriefInclude, BriefPrefs, BriefTone } from "@/lib/server/brief";

async function fetcher(url: string): Promise<BriefPrefs> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load brief settings.");
  return response.json();
}

const TONES: { value: BriefTone; label: string; hint: string }[] = [
  { value: "coach", label: "Coach", hint: "Pushes you a little — flags pace, nudges you to bank the difference." },
  { value: "analyst", label: "Analyst", hint: "Figures first, no cheerleading. Just states the position." },
  { value: "gentle", label: "Gentle", hint: "Low-pressure and reassuring — never a lecture." },
];

const SECTIONS: { key: keyof BriefInclude; label: string; hint: string }[] = [
  { key: "budget", label: "Budget & pace", hint: "What's left, per-day allowance, days to payday" },
  { key: "crypto", label: "Crypto", hint: "24h move, top mover, milestone hits" },
  { key: "debt", label: "Debt", hint: "What's owed and the monthly cost" },
  { key: "goals", label: "Goals & freedom", hint: "Progress toward the R2m freedom number" },
  { key: "kids", label: "Kids' accounts", hint: "What Lisa & Liam hold" },
];

/**
 * The daily-brief settings (Romano's ask, 2026-07-25). Voice and which
 * sections appear. Server-driven, because the brief is generated on the
 * server; a change clears today's cached brief so it shows next time Home
 * opens. Optimistic — the switch moves at once, and only rolls back if the
 * write fails.
 */
export function BriefSettings() {
  const toast = useToast();
  const { data: prefs, mutate } = useSWR<BriefPrefs>("/api/brief/prefs", fetcher, {
    revalidateOnFocus: false,
  });

  async function apply(patch: BriefPrefsPatch, optimistic: BriefPrefs) {
    await mutate(
      async () => {
        const result = await updateBriefPrefs(patch);
        if (!result.ok) {
          toast.show({ message: result.error, tone: "error" });
          throw new Error(result.error);
        }
        return result.data;
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false },
    );
  }

  return (
    <Card>
      <CardHeader
        title="Daily brief"
        description="The card that greets you on Home each morning. It's written once a day from your live figures — changes here show next time you open Home."
      />
      <CardBody className="space-y-4">
        {!prefs ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <ToggleRow
              label="Show the brief"
              hint="Turn the whole card on or off."
              on={prefs.enabled}
              onChange={(on) => apply({ enabled: on }, { ...prefs, enabled: on })}
            />

            <div className={prefs.enabled ? "" : "pointer-events-none opacity-40"}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                Voice
              </p>
              <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => apply({ tone: t.value }, { ...prefs, tone: t.value })}
                    className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                      prefs.tone === t.value
                        ? "bg-accent text-white"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {TONES.find((t) => t.value === prefs.tone)?.hint}
              </p>

              <p className="mb-1 mt-5 text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                What to include
              </p>
              <div>
                {SECTIONS.map((s) => (
                  <ToggleRow
                    key={s.key}
                    label={s.label}
                    hint={s.hint}
                    on={prefs.include[s.key]}
                    onChange={(on) =>
                      apply(
                        { include: { [s.key]: on } },
                        { ...prefs, include: { ...prefs.include, [s.key]: on } },
                      )
                    }
                  />
                ))}
              </div>
            </div>

            <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
              The figures are computed by the app — the assistant only phrases them, once a
              day. Reopening Home reuses that same brief, so it costs about one Haiku call daily.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-2.5 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="mt-0.5 text-[11.5px] text-faint">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
          on ? "bg-accent" : "bg-line-2"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
