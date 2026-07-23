"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import {
  copyBudgetsForward, deleteBudgetLine, restoreBudgetLine, seedBudgetsBlank,
  seedBudgetsFromActuals, setExpectedIncome,
} from "@/app/actions/budgets";
import { BudgetLineEditor } from "@/components/budget/BudgetLineEditor";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AmountInput } from "@/components/ui/AmountInput";
import { EditableAmount } from "@/components/ui/EditableAmount";
import { useToast } from "@/components/ui/Toast";
import { Money, Percent } from "@/components/ui/Money";
import { parseAmount } from "@/lib/amount";
import { iconForCategory } from "@/lib/categoryIcons";
import { spendPace, type BudgetSummary } from "@/lib/budget";
import { formatDate, formatPercent } from "@/lib/format";

async function fetcher(url: string): Promise<BudgetSummary> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Could not load the budget.");
  }
  return response.json();
}

export function BudgetScreen() {
  const { data, error, mutate } = useSWR<BudgetSummary>("/api/budget", fetcher, {
    refreshInterval: 120_000,
  });
  const { mutate: mutateAll } = useSWRConfig();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A budget edit changes figures Home also shows (budget left, per-day).
  // Refetch every API-backed screen, not just this one — otherwise Home can
  // keep the old number for up to its 2-minute refresh window and the edit
  // looks like it didn't take.
  const refresh = () => {
    void mutate();
    void mutateAll((key) => typeof key === "string" && key.startsWith("/api/"));
  };

  async function saveIncome(raw: string) {
    const value = parseAmount(raw);
    setIncomeDraft(null);
    if (value === null || value === plan.expectedIncomeZar) return;
    const result = await setExpectedIncome(value);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    refresh();
  }

  async function onRemove(recordId: string, category: string) {
    setBusy(true);
    const result = await deleteBudgetLine(recordId);
    setBusy(false);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    refresh();
    // Removing a line never touches the transactions underneath it, so undo
    // costs nothing and the spend is still there either way.
    const { snapshot } = result.data;
    toast.show({
      message: `${category} budget removed`,
      tone: "neutral",
      onUndo: async () => {
        const undone = await restoreBudgetLine(snapshot);
        refresh();
        toast.show(
          undone.ok
            ? { message: `${category} restored`, tone: "neutral" }
            : { message: `Couldn't undo: ${undone.error}`, tone: "error" },
        );
      },
    });
  }

  async function onStartCycle(how: "seed" | "copy" | "blank") {
    setBusy(true);
    const result =
      how === "seed" ? await seedBudgetsFromActuals()
      : how === "copy" ? await copyBudgetsForward()
      : await seedBudgetsBlank();
    setBusy(false);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    refresh();
    const count = "created" in result.data ? result.data.created : result.data.copied;
    toast.show({ message: `${count} budget lines ready to adjust`, tone: "success" });
  }

  if (error) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-loss">Couldn&apos;t load the budget</p>
          <p className="mt-1.5 text-xs text-muted">{error.message}</p>
        </CardBody>
      </Card>
    );
  }

  if (!data) {
    return (
      <LoadingCard rows={4} />
    );
  }

  const { cycle, lines, totals, unbudgetedZar, unbudgetedCategories, dailyAllowanceZar, plan } =
    data;
  const pace = spendPace(data);
  const overspent = totals.remainingZar < 0;

  const overAllocated = plan.unallocatedZar < 0;
  // How far through the cycle we are, as a percentage — the marker's position.
  const throughPct =
    cycle.totalDays > 0 ? (cycle.elapsedDays / cycle.totalDays) * 100 : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Expected in this cycle
              </p>
              {incomeDraft === null ? (
                <button
                  type="button"
                  onClick={() => setIncomeDraft(String(plan.expectedIncomeZar))}
                  className="mt-1 block text-xl font-semibold tracking-tight hover:text-accent"
                >
                  <Money value={plan.expectedIncomeZar} variant="whole" />
                </button>
              ) : (
                <AmountInput
                  autoFocus
                  value={incomeDraft}
                  onChange={setIncomeDraft}
                  ariaLabel="Expected income this cycle"
                  className="tnum mt-1 h-10 w-40 rounded-lg border border-accent bg-surface-2 px-2 text-lg outline-none"
                />
              )}
              <p className="mt-1 text-[11px] text-faint">
                <Money value={plan.receivedIncomeZar} variant="whole" /> received so far
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                {overAllocated ? "Over-allocated" : "Still to allocate"}
              </p>
              <Money
                value={Math.abs(plan.unallocatedZar)}
                variant="whole"
                className={`mt-1 block text-xl font-semibold tracking-tight ${
                  overAllocated ? "text-loss" : "text-gain"
                }`}
              />
              <p className="mt-1 text-[11px] text-faint">
                <Money value={plan.allocatedZar} variant="whole" /> to spend ·{" "}
                <Money value={plan.puttingAwayZar} variant="whole" /> away
              </p>
            </div>
          </div>
          {incomeDraft !== null ? (
            <button
              type="button"
              onClick={() => void saveIncome(incomeDraft)}
              className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
            >
              Save expected income
            </button>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              {overspent ? "Over budget by" : "Left this cycle"}
            </p>
            <p className="text-[11px] text-faint">
              {formatDate(cycle.start)} → {formatDate(cycle.end)} ·{" "}
              {cycle.remainingDays} {cycle.remainingDays === 1 ? "day" : "days"} left
            </p>
          </div>

          <Money
            value={Math.abs(totals.remainingZar)}
            variant="whole"
            className={`mt-1.5 block text-3xl font-semibold tracking-tight ${
              overspent ? "text-loss" : ""
            }`}
          />

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-raise">
            <div
              className={`h-full rounded-full ${overspent ? "bg-loss" : "bg-accent"}`}
              style={{
                width: `${Math.min(
                  100,
                  totals.budgetedZar > 0
                    ? (totals.actualZar / totals.budgetedZar) * 100
                    : 0,
                )}%`,
              }}
            />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Budgeted">
              <Money value={totals.budgetedZar} variant="whole" />
            </Stat>
            <Stat label="Spent">
              <Money value={totals.actualZar} variant="whole" />
            </Stat>
            <Stat label="Income">
              <Money value={totals.incomeZar} variant="whole" />
            </Stat>
            <Stat label="Per day left">
              {dailyAllowanceZar === null ? (
                <span className="text-muted">—</span>
              ) : (
                <Money
                  value={dailyAllowanceZar}
                  variant="whole"
                  className={dailyAllowanceZar < 0 ? "text-loss" : ""}
                />
              )}
            </Stat>
          </dl>

          {pace !== null ? (
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
              You&apos;re {formatPercent(cycle.totalDays ? (cycle.elapsedDays / cycle.totalDays) * 100 : 0, 0)}{" "}
              through the cycle and have used{" "}
              {formatPercent(
                totals.budgetedZar > 0 ? (totals.actualZar / totals.budgetedZar) * 100 : 0,
                0,
              )}{" "}
              of the budget —{" "}
              <span className={pace > 1.05 ? "text-warn" : "text-gain"}>
                {pace > 1.05
                  ? `spending ${formatPercent((pace - 1) * 100, 0)} faster than the days are passing`
                  : "tracking at or below pace"}
              </span>
              .
            </p>
          ) : null}
        </CardBody>
      </Card>

      {unbudgetedZar > 0 ? (
        <details className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3">
          <summary className="cursor-pointer text-xs font-medium text-warn">
            <Money value={unbudgetedZar} variant="whole" /> spent outside any budget line
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            These categories have no budget for this cycle, so the figures above
            don&apos;t include them. Real money — shown here rather than hidden.
          </p>
          <ul className="mt-2 space-y-1">
            {unbudgetedCategories.map((entry) => (
              <li
                key={entry.category}
                className="flex justify-between gap-3 text-[11px] text-muted"
              >
                <span>{entry.category}</span>
                <Money value={entry.amountZar} variant="whole" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Card>
        <CardHeader
          title="Categories"
          description={
            throughPct === null
              ? "What you spend to live. Money you put away is planned on Savings."
              : `The mark on each bar is where you are in the cycle — ${Math.round(
                  throughPct,
                )}% through, ${cycle.remainingDays} ${
                  cycle.remainingDays === 1 ? "day" : "days"
                } left.`
          }
          action={
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium hover:bg-surface-2"
            >
              <Plus size={13} strokeWidth={2} />
              Add
            </button>
          }
        />
        {lines.length === 0 ? (
          <CardBody className="py-8 text-center">
            <p className="text-sm font-medium">No budget set for this cycle yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
              A cycle starts fresh on payday. Both totals are shown so you can see
              what you&apos;re choosing — then change any line by tapping it.
            </p>
            <div className="mx-auto mt-4 flex max-w-sm flex-col gap-2">
              {data.cycleStart ? (
                <>
                  <button
                    type="button"
                    onClick={() => void onStartCycle("seed")}
                    disabled={busy}
                    className="rounded-lg bg-accent px-3.5 py-2.5 text-left text-xs font-medium text-white disabled:opacity-60"
                  >
                    Use what I actually spent ·{" "}
                    <Money value={data.cycleStart.seedTotalZar} variant="whole" />
                    <span className="mt-0.5 block text-[11px] font-normal opacity-80">
                      {data.cycleStart.seedLines} lines from real spending, rounded to R10
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onStartCycle("copy")}
                    disabled={busy}
                    className="rounded-lg border border-line px-3.5 py-2.5 text-left text-xs font-medium disabled:opacity-60"
                  >
                    Copy last cycle&apos;s budget ·{" "}
                    <Money value={data.cycleStart.copyTotalZar} variant="whole" />
                    <span className="mt-0.5 block text-[11px] font-normal text-muted">
                      {data.cycleStart.copyLines} lines, the amounts you had planned
                    </span>
                  </button>
                  <p className="px-0.5 text-left text-[11px] leading-relaxed text-faint">
                    Actuals only reflect what you logged. If a cycle was tracked
                    loosely, seeding from it will set the budget too low.
                  </p>
                </>
              ) : null}
              {data.blankStart ? (
                <button
                  type="button"
                  onClick={() => void onStartCycle("blank")}
                  disabled={busy}
                  className={`rounded-lg px-3.5 py-2.5 text-left text-xs font-medium disabled:opacity-60 ${
                    data.cycleStart
                      ? "border border-line"
                      : "bg-accent text-white"
                  }`}
                >
                  Bring back my categories · {data.blankStart.titles} titles
                  <span
                    className={`mt-0.5 block text-[11px] font-normal ${
                      data.cycleStart ? "text-muted" : "opacity-80"
                    }`}
                  >
                    The names you had, every amount at R0 — fill them in as the
                    month teaches you
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium"
              >
                Add lines one at a time
              </button>
            </div>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((line) => {
              const over = line.remainingZar < 0;
              // Spending faster than the days are passing, by enough to matter.
              const ahead =
                throughPct !== null && line.budgetedZar > 0 && line.usedPct > throughPct + 5;
              return (
                <li key={line.recordId} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {(() => {
                        const Icon = iconForCategory(line.category);
                        return <Icon size={14} strokeWidth={1.75} className="shrink-0 text-muted" />;
                      })()}
                      {line.category}
                      {line.type ? (
                        <span className="ml-2 rounded bg-raise px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">
                          {line.type}
                        </span>
                      ) : null}
                    </p>
                    {/* Spent is derived from the ledger, so only the budget
                        itself can be edited here. */}
                    <p className="shrink-0 text-sm">
                      <Money value={line.actualZar} variant="whole" />
                      <span className="text-faint"> / </span>
                      <EditableAmount
                        editKey="budget.budgeted"
                        recordId={line.recordId}
                        value={line.budgetedZar}
                        onSaved={refresh}
                        className="text-muted"
                      />
                    </p>
                  </div>

                  {/* The marker sits where you are in the cycle, so the bar
                      answers "am I ahead or behind" rather than just "how much
                      is left". It matters more here than in a calendar-month
                      app: a 27-day cycle followed by a 34-day one can't be
                      eyeballed. A line with no amount and no spend gets no bar
                      — a bar of nothing means nothing. */}
                  {line.budgetedZar === 0 && line.actualZar === 0 ? null : (
                  <div className="relative mt-2 h-1.5 w-full rounded-full bg-raise">
                    <div
                      className={`h-full rounded-full ${
                        over ? "bg-loss" : ahead ? "bg-warn" : "bg-accent"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, line.usedPct))}%` }}
                    />
                    {throughPct !== null && line.budgetedZar > 0 ? (
                      <span
                        aria-hidden
                        title={`You're ${Math.round(throughPct)}% through the cycle`}
                        className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-ink/70"
                        style={{ left: `${Math.min(100, throughPct)}%` }}
                      />
                    ) : null}
                  </div>
                  )}

                  <p className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-faint">
                    <span className="flex items-center gap-2">
                      {line.transactionCount}{" "}
                      {line.transactionCount === 1 ? "entry" : "entries"}
                      <button
                        type="button"
                        onClick={() => void onRemove(line.recordId, line.category)}
                        disabled={busy}
                        aria-label={`Remove the ${line.category} budget`}
                        className="text-faint transition-colors hover:text-loss disabled:opacity-40"
                      >
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    </span>
                    {line.budgetedZar === 0 && line.actualZar === 0 ? (
                      <span>no amount yet — tap the figure to set one</span>
                    ) : (
                      <span className={over ? "text-loss" : ""}>
                        {over ? "over by " : "left "}
                        <Money value={Math.abs(line.remainingZar)} variant="whole" />
                        {" · "}
                        <Percent value={line.usedPct} decimals={0} />
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <BudgetLineEditor
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={refresh}
        available={data.availableCategories}
        cycleLabel={`${formatDate(cycle.start)} → ${formatDate(cycle.end)}`}
      />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
