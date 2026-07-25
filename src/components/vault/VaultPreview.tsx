"use client";

import {
  AlertTriangle,
  Coins,
  Download,
  Eye,
  Heart,
  Landmark,
  Lock,
  Printer,
  RefreshCw,
  Scale,
  User,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Card, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

/**
 * Vault — PREVIEW ONLY (Romano's ask, 2026-07-25). A design mock rendered in
 * the real app so it can be felt on a phone before the real thing is built.
 *
 * Deliberately inert: no data is saved, the figures are sample values, and the
 * unlock isn't wired to anything. The banner says so, and the sample notes are
 * marked as examples, so nothing here can be mistaken for a working vault or
 * for Romano's real details.
 */

type Mode = "owner" | "glass";

export function VaultPreview() {
  const [mode, setMode] = useState<Mode>("owner");
  const [unlocked, setUnlocked] = useState(false);
  const toast = useToast();
  const preview = () => toast.show({ message: "Preview only — this isn't wired up yet.", tone: "neutral" });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5">
        <AlertTriangle size={15} strokeWidth={1.9} className="mt-0.5 shrink-0 text-warn" />
        <p className="text-[12px] leading-relaxed text-ink">
          <span className="font-semibold">Preview of the Vault.</span> This is a design mock — the
          figures are samples, nothing is saved, and the unlock isn&apos;t live yet. It&apos;s here
          so you can feel the idea before it&apos;s built for real.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
        <ModeButton icon={User} label="Your vault" on={mode === "owner"} onClick={() => setMode("owner")} />
        <ModeButton
          icon={Lock}
          label="Break glass"
          on={mode === "glass"}
          onClick={() => {
            setMode("glass");
            setUnlocked(false);
          }}
        />
      </div>

      {mode === "owner" ? <OwnerView onPreview={preview} /> : null}
      {mode === "glass" ? (
        <GlassView unlocked={unlocked} onUnlock={() => setUnlocked(true)} onPreview={preview} />
      ) : null}
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  on,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
        on ? "bg-accent text-white" : "text-muted hover:text-ink"
      }`}
    >
      <Icon size={14} strokeWidth={1.9} />
      {label}
    </button>
  );
}

/* ---------- owner view ---------- */

function OwnerView({ onPreview }: { onPreview: () => void }) {
  return (
    <div className="space-y-3">
      <Card className="border-accent/30 bg-gradient-to-br from-accent/10 to-surface">
        <CardBody>
          <Pill tone="accent">Recovery code · sealed</Pill>
          <code className="mt-2.5 block rounded-lg border border-line bg-bg px-3 py-2.5 text-center font-mono text-[15px] font-semibold tracking-[0.16em]">
            PWOS · 7K4Q · M2XR · 9F1D
          </code>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
            Write this down once and keep it safe — a home safe, or told to someone you trust. It&apos;s
            the only way in for family, and it&apos;s never shown again after today.
          </p>
          <div className="mt-3 flex gap-2">
            <GhostButton icon={Printer} label="Print sealed card" onClick={onPreview} />
            <GhostButton icon={RefreshCw} label="Regenerate" onClick={onPreview} />
          </div>
        </CardBody>
      </Card>

      <Section icon={Landmark} title="Money map">
        <SubHead pill="live">Accounts · sample</SubHead>
        <Rows
          rows={[
            ["Capitec Main", "spendable", "R12 940"],
            ["GOtyme", "spendable", "R5 480"],
            ["ABSA · Capitec Savings", "+ 3 savings pots", "R41 260"],
            ["Capitec Business", "CreativeDigital", "R18 300"],
          ]}
        />
        <SubHead pill="note">Also worth knowing · example</SubHead>
        <NoteBox>
          Insurance: <b>Old Mutual life cover</b> — policy #, broker name &amp; number. Cash in the home
          safe ≈ <b>R8 000</b>. CreativeDigital &amp; Natroceutics income to be redirected to
          Janeese&apos;s account.
        </NoteBox>
      </Section>

      <Section icon={Scale} title="Debt & obligations">
        <SubHead pill="live">Under debt review · sample</SubHead>
        <Rows
          rows={[
            ["Home loan", "", "R975 000"],
            ["Anders", "estimated", "R160 345", "est"],
            ["MBD Legal", "possible duplicate of Anders", "R160 745", "est"],
          ]}
        />
        <SubHead pill="note">What to do · example</SubHead>
        <NoteBox>
          Debt-review counsellor: name, reference &amp; number. Keep paying the monthly instalment — do
          <b> not</b> let it default. The Anders/MBD entry may be one debt counted twice.
        </NoteBox>
      </Section>

      <Section icon={Coins} title="Crypto plan">
        <SubHead pill="live">Where the coins live · sample</SubHead>
        <Rows
          rows={[
            ["Tangem — Forever Bag", "long-term hold", "R74 200"],
            ["EasyCrypto · Luno", "+ Growth / Trading", "R63 800"],
          ]}
        />
        <SubHead pill="note">Read before touching anything · example</SubHead>
        <NoteBox warn>
          The <b>seed phrases are NOT in this app.</b> The Tangem card and recovery sheet are in the home
          safe; the combo is with Janeese. <b>Don&apos;t panic-sell.</b> Follow the milestones in PWOS:
          hold the Forever Bag to <b>M5 (Feb 2028)</b>. No breakeven sells.
        </NoteBox>
      </Section>

      <Section icon={Heart} title="Personal wishes">
        <NoteBox>
          A few words for Janeese, Lisa and Liam, plus funeral preferences and family messages, would be
          saved here. <span className="text-faint">Tap to read / edit, when live.</span>
        </NoteBox>
      </Section>
    </div>
  );
}

/* ---------- break-glass view ---------- */

function GlassView({
  unlocked,
  onUnlock,
  onPreview,
}: {
  unlocked: boolean;
  onUnlock: () => void;
  onPreview: () => void;
}) {
  if (!unlocked) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center px-6 py-10 text-center">
          <span className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Lock size={26} strokeWidth={1.8} />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">Romano&apos;s Vault</h2>
          <p className="mx-auto mt-1.5 max-w-[30ch] text-[13px] leading-relaxed text-muted">
            If Romano gave you a recovery code, enter it to open his vault. He&apos;ll be told it was
            opened.
          </p>
          <input
            defaultValue="7K4Q-M2XR-9F1D"
            spellCheck={false}
            className="mt-4 w-full rounded-xl border border-line-2 bg-surface px-3 py-3 text-center font-mono text-[16px] uppercase tracking-[0.14em] outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={onUnlock}
            className="mt-3 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Unlock the vault
          </button>
          <p className="mt-3 text-[11px] text-faint">
            Read-only. You can see everything and print it — you can&apos;t change anything or move money.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/10 px-3.5 py-3">
        <Eye size={16} strokeWidth={1.9} className="mt-0.5 shrink-0 text-info" />
        <p className="text-[11.5px] leading-relaxed text-ink">
          <b>Opened in read-only.</b> Romano has been notified this vault was unlocked, just now.
          Nothing here can be edited, and no account can be accessed — it&apos;s a record, not a key.
        </p>
      </div>

      <button
        type="button"
        onClick={onPreview}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Download size={15} strokeWidth={2} />
        Download “If something happens to me” pack (PDF)
      </button>

      <Section icon={Landmark} title="Money map">
        <Rows
          rows={[
            ["Capitec Main", "", "R12 940"],
            ["GOtyme", "", "R5 480"],
            ["ABSA · Savings pots", "", "R41 260"],
          ]}
        />
        <NoteBox>Insurance: Old Mutual (policy #, broker). Redirect CreativeDigital &amp; Natroceutics income to Janeese.</NoteBox>
      </Section>

      <Section icon={Coins} title="Crypto plan">
        <NoteBox warn>
          Seeds are in the home safe (combo with Janeese), <b>not</b> in this app. Don&apos;t panic-sell —
          hold the Forever Bag to Feb 2028 per the milestone plan.
        </NoteBox>
      </Section>

      <p className="pt-1 text-center text-[11px] text-faint">
        Debt &amp; obligations · Personal wishes — also included in the pack.
      </p>
    </div>
  );
}

/* ---------- little building blocks ---------- */

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Icon size={16} strokeWidth={1.9} className="text-accent" />
        <span className="text-[13.5px] font-semibold tracking-tight">{title}</span>
      </div>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function Pill({ tone, children }: { tone: "accent" | "note"; children: React.ReactNode }) {
  const cls =
    tone === "accent"
      ? "bg-accent/12 text-accent"
      : "border border-line bg-surface-2 text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.04em] ${cls}`}>
      {children}
    </span>
  );
}

function SubHead({ pill, children }: { pill: "live" | "note"; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-3.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint first:mt-0">
      {pill === "live" ? <Pill tone="accent">Live from PWOS</Pill> : <Pill tone="note">Your note</Pill>}
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: (string | undefined)[][] }) {
  return (
    <div className="flex flex-col">
      {rows.map(([label, sub, value, tone], i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0"
        >
          <span className="min-w-0 text-[13px]">
            {label}
            {sub ? <span className="mt-0.5 block text-[11px] text-faint">{sub}</span> : null}
          </span>
          <span
            className={`shrink-0 whitespace-nowrap text-[13px] font-semibold tnum ${
              tone === "est" ? "text-warn" : ""
            }`}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function NoteBox({ children, warn = false }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-[13px] leading-relaxed ${
        warn ? "border-warn/45 bg-warn/10" : "border-line bg-surface-2"
      }`}
    >
      {children}
    </div>
  );
}

function GhostButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] font-medium transition-colors hover:border-line-2"
    >
      <Icon size={14} strokeWidth={1.9} />
      {label}
    </button>
  );
}
