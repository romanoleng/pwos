"use client";

import { ChevronRight, Shapes } from "lucide-react";
import Link from "next/link";

import { FreshStart } from "@/components/settings/FreshStart";
import { ThemeToggle } from "@/components/theme";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { CORE_5, FREEDOM_TARGET_LABEL, FREEDOM_TARGET_ZAR, PAYDAY_DAY_OF_MONTH } from "@/lib/constants";
import { formatMoneyWhole } from "@/lib/format";

export function SettingsScreen() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Manage"
          description="The lists the rest of the app reads from."
        />
        <ul className="divide-y divide-line">
          <li>
            <Link
              href="/settings/categories"
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <Shapes size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Categories</span>
                <span className="mt-0.5 block text-[11px] text-faint">
                  Rename, merge, retire, reorder and pin
                </span>
              </span>
              <ChevronRight size={14} strokeWidth={1.75} className="shrink-0 text-faint" />
            </Link>
          </li>
        </ul>
      </Card>

      <FreshStart defaultDate="2026-07-24" />

      <Card>
        <CardHeader title="Appearance" />
        <CardBody className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm">Theme</p>
            <p className="mt-0.5 text-[11px] text-faint">Dark by default. Your choice is remembered on this device.</p>
          </div>
          <ThemeToggle />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Locale and cycle" description="Locked in the spec — shown here so the app's assumptions are visible." />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <Row label="Currency">ZAR, formatted en-ZA</Row>
            <Row label="Timezone">Africa/Johannesburg</Row>
            <Row label="Payday">{PAYDAY_DAY_OF_MONTH}th — budget cycle runs {PAYDAY_DAY_OF_MONTH}th to {PAYDAY_DAY_OF_MONTH}th</Row>
            <Row label="Freedom number">{formatMoneyWhole(FREEDOM_TARGET_ZAR)} by {FREEDOM_TARGET_LABEL}</Row>
            <Row label="Core 5">{CORE_5.join(" · ")}</Row>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Data" description="Where each figure comes from." />
        <CardBody>
          <ul className="space-y-2 text-[11px] leading-relaxed text-muted">
            <li><span className="text-ink">Crypto prices</span> — CoinGecko, server-side, cached 45s. The browser never calls it directly.</li>
            <li><span className="text-ink">Everything else</span> — Neon Postgres, read through this app&apos;s own API. Every change is recorded in an audit trail.</li>
            <li><span className="text-ink">Net worth</span> — derived live, never hand-maintained.</li>
            <li><span className="text-ink">Budget actuals</span> — computed from the typed ledger, not the stored Actual column.</li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Session" />
        <CardBody className="flex items-center gap-3">
          <SignOutButton />
          <div>
            <p className="text-sm">Sign out</p>
            <p className="mt-0.5 text-[11px] text-faint">
              To change your password, edit APP_PASSWORD in .env.local (or in Vercel) and restart.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
