"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import {
  copyBudgetsForward, deleteBudgetLine, restoreBudgetLine, seedBudgetsFromActuals,
} from "@/app/actions/budgets";
import { BudgetLineEditor } from "@/components/budget/BudgetLineEditor";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EditableAmount } from "@/components/ui/EditableAmount";
import { useToast } from "@/components/ui/Toast";
import { Money, Percent } from "@/components/ui/Money";
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
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => void mutate();

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

  async function onStartCycle(how: "seed" | "copy") {
    setBusy(true);
    const result = how === "seed" ? await seedBudgetsFromActuals() : await copyBudgetsForward();
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
      <Card>
        <CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody>
      </Card>
    );
  }

  const { cycle, lines, totals, unbudgetedZar, unbudgetedCategories, dailyAllowanceZar } =
    data;
  const pace = spendPace(data);
  const overspent = totals.remainingZar < 0;

  return (
    <div className="space-y-4">
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
          description="What you spend to live. Money you put away is planned on Goals."
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
              return (
                <li key={line.recordId} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">
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

                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raise">
                    <div
                      className={`h-full rounded-full ${over ? "bg-loss" : "bg-accent"}`}
                      style={{ width: `${Math.min(100, Math.max(0, line.usedPct))}%` }}
                    />
                  </div>

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
                    <span className={over ? "text-loss" : ""}>
                      {over ? "over by " : "left "}
                      <Money value={Math.abs(line.remainingZar)} variant="whole" />
                      {" · "}
                      <Percent value={line.usedPct} decimals={0} />
                    </span>
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
