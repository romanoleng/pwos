"use client";

import Link from "next/link";

import { Card, CardBody } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import type { DataCheck, LogCheckStatus } from "@/lib/server/datacheck";

/** Chip colour per status — green = counts, amber = needs a line, red = wrong
 *  date, muted = deliberately not spend / hidden. */
const STATUS: Record<LogCheckStatus, { label: string; cls: string }> = {
  ok: { label: "Counts", cls: "bg-gain/15 text-gain" },
  unbudgeted: { label: "No line", cls: "bg-warn/15 text-warn" },
  uncategorised: { label: "No category", cls: "bg-warn/15 text-warn" },
  "other-cycle": { label: "Wrong cycle", cls: "bg-loss/15 text-loss" },
  hidden: { label: "Hidden", cls: "bg-loss/15 text-loss" },
  "not-spend": { label: "Not spend", cls: "bg-info/15 text-info" },
};

export function DataCheckReport({ data }: { data: DataCheck }) {
  const { cycle, counts, recent, issues, moved } = data;
  const problems = recent.filter((r) => r.status !== "ok" && r.status !== "not-spend");

  return (
    <div className="space-y-4">
      {/* What "this cycle" actually means right now. */}
      <Card>
        <CardBody>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">This budget cycle</p>
          <p className="mt-1 text-sm font-semibold">{cycle.start} → {cycle.end}</p>
          <p className="mt-1 text-[11px] text-faint">
            {cycle.floor
              ? `Anything dated before your fresh start (${cycle.floor}) is hidden everywhere.`
              : "No fresh-start cutover set."}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span>{counts.expense} expense</span>
            <span>{counts.income} income</span>
            <span>{counts.transfer} transfer</span>
            <span>{counts.contribution} contribution</span>
            <span className="text-faint">· logged in this cycle</span>
          </div>
        </CardBody>
      </Card>

      {/* The petrol case, named plainly. */}
      {issues.unbudgeted.length > 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm font-semibold text-warn">Logged, but not on any budget line</p>
            <p className="mt-1 text-[11px] text-faint">
              Real spend this cycle whose category has no matching budget line, so it never
              shows as a line — only inside “spent outside any budget line” on Budgets.
            </p>
            <ul className="mt-2 divide-y divide-line">
              {issues.unbudgeted.map((u) => (
                <li key={u.category} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="truncate">{u.category} <span className="text-faint">· {u.count}×</span></span>
                  <Money value={u.amountZar} variant="whole" />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {issues.unknownCategories.length > 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm font-semibold text-warn">Categories not in your list</p>
            <p className="mt-1 text-[11px] text-faint">
              These were logged with a category that no longer exists in your category list,
              so they can never match a budget line. Rename or re-file them.
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {issues.unknownCategories.map((u) => (
                <li key={u.category} className="rounded-md bg-surface-2 px-2 py-1 text-[11px]">
                  {u.category} · {u.count}×
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {issues.uncategorisedCount > 0 ? (
        <Card>
          <CardBody className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-warn">Uncategorised spend</p>
              <p className="mt-1 text-[11px] text-faint">{issues.uncategorisedCount} expense(s) with no category.</p>
            </div>
            <Money value={issues.uncategorisedZar} variant="whole" className="text-sm" />
          </CardBody>
        </Card>
      ) : null}

      {/* Recent logs, each with a plain verdict. This is the cross-check. */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Your recent logs</p>
            <span className="text-[11px] text-faint">
              {problems.length > 0 ? `${problems.length} need a look` : "all landing correctly"}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {recent.map((r) => {
              const chip = STATUS[r.status];
              return (
                <li key={r.recordId} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${chip.cls}`}>
                        {chip.label}
                      </span>
                      <span className="truncate text-sm">{r.description}</span>
                    </span>
                    <span className="shrink-0 text-sm">
                      <Money value={r.amountZar} variant="whole" />
                    </span>
                  </div>
                  <p className="mt-0.5 pl-1 text-[11px] text-faint">
                    {r.date} · {r.category ?? "—"}
                    {r.subcategory ? ` › ${r.subcategory}` : ""}
                    {r.accountLabel ? ` · ${r.accountLabel}` : ""} — {r.reason}
                  </p>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <p className="text-[11px] text-faint">
        Money that moved but isn&apos;t spend this cycle: transfers{" "}
        <Money value={moved.transferZar} variant="whole" /> · contributions{" "}
        <Money value={moved.contributionZar} variant="whole" />. Fix a mis-filed entry from the{" "}
        <Link href="/transactions" className="text-accent hover:underline">Ledger</Link>.
      </p>
    </div>
  );
}
