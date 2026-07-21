"use client";

import { AlertTriangle, Check, Save } from "lucide-react";
import { useState, useTransition } from "react";

import {
  commitSnapshot,
  previewSnapshot,
  type PreviewResult,
} from "@/app/actions/snapshot";
import { Money } from "@/components/ui/Money";
import { FIELDS } from "@/lib/airtable-fields";
import { formatDate } from "@/lib/format";

type Stage =
  | { kind: "idle" }
  | { kind: "previewing" }
  | { kind: "preview"; result: PreviewResult }
  | { kind: "done"; date: string; wroteSnapshots: boolean }
  | { kind: "error"; message: string };

/**
 * Snapshot write-back (CLAUDE.md §5, §10).
 *
 * Never writes on first click. It fetches a preview of the exact payload,
 * shows it, and writes only after a second explicit confirmation — so the
 * "ask before writing to Airtable" guardrail is enforced by the feature
 * itself rather than by anyone remembering to ask.
 */
export function SnapshotButton() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function openPreview() {
    setStage({ kind: "previewing" });
    startTransition(async () => {
      const result = await previewSnapshot();
      setStage({ kind: "preview", result });
    });
  }

  function confirm() {
    startTransition(async () => {
      const result = await commitSnapshot();
      setStage(
        result.ok
          ? { kind: "done", date: result.date, wroteSnapshots: result.wroteSnapshots }
          : { kind: "error", message: result.error },
      );
    });
  }

  if (stage.kind === "done") {
    return (
      <p className="flex items-center gap-2 text-xs text-gain">
        <Check size={14} strokeWidth={2} />
        Snapshot saved for {formatDate(stage.date)}
        {stage.wroteSnapshots ? " (both tables)" : " (Daily Crypto Report only)"}.
      </p>
    );
  }

  if (stage.kind === "idle" || stage.kind === "previewing") {
    return (
      <button
        type="button"
        onClick={openPreview}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-line-2 hover:text-ink disabled:opacity-50"
      >
        <Save size={13} strokeWidth={1.75} />
        {stage.kind === "previewing" ? "Preparing…" : "Save snapshot"}
      </button>
    );
  }

  if (stage.kind === "error") {
    return (
      <div className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2">
        <p className="text-xs text-loss">Snapshot failed: {stage.message}</p>
        <button
          type="button"
          onClick={() => setStage({ kind: "idle" })}
          className="mt-1.5 text-[11px] text-muted underline"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const { result } = stage;

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2">
        <p className="text-xs text-loss">Couldn&apos;t prepare a snapshot: {result.error}</p>
        <button
          type="button"
          onClick={() => setStage({ kind: "idle" })}
          className="mt-1.5 text-[11px] text-muted underline"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const { preview } = result;
  const report = preview.dailyCryptoReport as Record<string, number | string>;

  return (
    <div className="w-full rounded-xl border border-line-2 bg-surface-2 p-4">
      <p className="text-sm font-medium">Write this to Airtable?</p>
      <p className="mt-1 text-xs text-muted">
        Creates one new row in <span className="text-ink">Daily Crypto Report</span>
        {preview.snapshots ? (
          <>
            {" "}
            and one in <span className="text-ink">Snapshots</span>
          </>
        ) : null}
        , dated {formatDate(preview.date)}. Nothing existing is changed or deleted.
      </p>

      <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
        <Row label="Total value">
          <Money value={Number(report[FIELDS.dailyCryptoReport.totalValueZar])} variant="whole" />
        </Row>
        <Row label="Total invested">
          <Money
            value={Number(report[FIELDS.dailyCryptoReport.totalInvestedZar])}
            variant="whole"
          />
        </Row>
        <Row label="P&L">
          <Money value={Number(report[FIELDS.dailyCryptoReport.pnlZar])} variant="whole" signed />
        </Row>
        <Row label="R2m progress">
          <span className="tnum">
            {Number(report[FIELDS.dailyCryptoReport.r2mProgressPct])}%
          </span>
        </Row>
        <Row label="Milestones hit">
          <span className="tnum">
            {Number(report[FIELDS.dailyCryptoReport.milestonesHitCount])}
          </span>
        </Row>
        {preview.usdRate ? (
          <Row label="USD rate">
            <span className="tnum" title={preview.usdRateBasis}>
              {preview.usdRate.toFixed(4)}
            </span>
          </Row>
        ) : null}
      </dl>

      {preview.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {preview.warnings.map((warning) => (
            <li key={warning} className="flex gap-1.5 text-[11px] leading-relaxed text-warn">
              <AlertTriangle size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Writing…" : "Write it"}
        </button>
        <button
          type="button"
          onClick={() => setStage({ kind: "idle" })}
          disabled={pending}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
