"use client";

import { Money, Percent, Sensitive } from "@/components/ui/Money";
import type { MilestoneStatus } from "@/lib/crypto/milestones";

const LEVEL_LABEL: Record<number, string> = {
  1: "M1",
  2: "M2",
  3: "M3",
  4: "M4 · peak",
  5: "M5 · exit",
};

/**
 * The M1–M5 ladder for one coin (CLAUDE.md §5).
 *
 * The raw milestone text is always rendered as the instruction. Parsed values
 * drive the trigger, the hit state and the distance only — a sell instruction
 * is never paraphrased, because getting it subtly wrong is worse than showing
 * nothing.
 */
export function MilestoneLadder({ statuses }: { statuses: MilestoneStatus[] }) {
  const present = statuses.filter((status) => !status.milestone.none);

  if (present.length === 0) {
    return <p className="text-xs text-faint">No milestones set for this coin.</p>;
  }

  return (
    <ol className="space-y-2">
      {present.map((status) => {
        const { milestone } = status;
        return (
          <li
            key={milestone.level}
            className={`rounded-lg border px-3 py-2 ${
              status.hit ? "border-gain/40 bg-gain/5" : "border-line bg-surface-2"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-tight text-muted">
                  {LEVEL_LABEL[milestone.level] ?? `M${milestone.level}`}
                </span>
                {status.hit ? (
                  <span className="rounded bg-gain/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gain">
                    Hit
                  </span>
                ) : null}
                {milestone.isDateBased ? (
                  <span className="rounded bg-raise px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    Feb 2028
                  </span>
                ) : null}
              </span>

              <span className="flex items-baseline gap-2 text-xs">
                {milestone.triggerZar !== null ? (
                  <Money value={milestone.triggerZar} variant="unit" />
                ) : null}
                {status.distancePct !== null && status.distancePct > 0 ? (
                  <span className="text-faint">
                    <Percent value={status.distancePct} /> away
                  </span>
                ) : null}
                {milestone.triggerZar !== null && status.distancePct === null ? (
                  <span className="text-faint">distance unknown</span>
                ) : null}
              </span>
            </div>

            {/* Verbatim instruction — never reworded. Sensitive because the
                raw text is full of prices and coin counts, which the privacy
                eye must catch just like the rendered figures. */}
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              <Sensitive>{milestone.raw}</Sensitive>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
