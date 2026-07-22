"use client";

import { ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { deleteTransaction, restoreTransaction } from "@/app/actions/transactions";
import { LogTransaction, type EditingTransaction } from "@/components/transactions/LogTransaction";
import { CalendarView, MonthlyView, SummaryView } from "@/components/transactions/TransactionViews";
import { useToast } from "@/components/ui/Toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money, Sensitive } from "@/components/ui/Money";
import { formatDate } from "@/lib/format";
import type { TransactionRow } from "@/lib/server/transactions";
import type { TransactionType } from "@/lib/transactions";

async function fetcher(url: string): Promise<{ transactions: TransactionRow[] }> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Could not load transactions.");
  }
  return response.json();
}

const TYPE_TONE: Record<TransactionType, string> = {
  expense: "text-muted",
  income: "text-gain",
  transfer: "text-info",
  contribution: "text-accent",
};

const TYPES: TransactionType[] = ["expense", "income", "transfer", "contribution"];

const VIEWS = [
  { key: "list", label: "Daily" },
  { key: "calendar", label: "Calendar" },
  { key: "monthly", label: "Monthly" },
  { key: "summary", label: "Summary" },
] as const;

export function TransactionsScreen() {
  const { data, error, mutate } = useSWR("/api/transactions", fetcher);
  const { data: home } = useSWR<{
    defaults: {
      accounts: { label: string; kind: string }[];
      allCategories: { name: string; kind: string }[];
      categories: string[];
      kidAccounts: { id: string; child: string | null; account: string }[];
      suggestsNewCycle: boolean;
    };
  }>(
    "/api/home",
    (url: string) => fetch(url).then((r) => r.json()),
  );
  const toast = useToast();
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<EditingTransaction | null>(null);
  // Row actions are revealed on tap rather than always shown: a delete button
  // sitting permanently beside every row is easy to hit by accident on a phone.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(recordId: string, description: string) {
    setBusy(recordId);
    const result = await deleteTransaction(recordId);
    setBusy(null);
    if (!result.ok) {
      toast.show({ message: result.error, tone: "error" });
      return;
    }
    const deleted = result.data;
    setExpanded(null);
    void mutate();
    toast.show({
      message: `Deleted "${description}" · balance restored`,
      tone: "success",
      onUndo: async () => {
        const restored = await restoreTransaction(deleted);
        void mutate();
        toast.show(
          restored.ok
            ? { message: "Entry restored", tone: "neutral" }
            : { message: `Couldn't restore: ${restored.error}`, tone: "error" },
        );
      },
    });
  }
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "calendar" | "monthly" | "summary">("list");
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [types, setTypes] = useState<TransactionType[]>([]);

  const all = useMemo(() => data?.transactions ?? [], [data]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((row) => {
      if (dayFilter && row.date?.slice(0, 10) !== dayFilter) return false;
      if (types.length > 0 && !types.includes(row.type)) return false;
      if (!needle) return true;
      return `${row.description} ${row.category ?? ""} ${row.accountLabel ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [all, query, types, dayFilter]);

  // Negate rather than Math.abs: a refund sits in a spending category with a
  // positive amount ("Reversal - Purchase at Pick n Pay", +R508), and must
  // reduce spend rather than add to it.
  const spend = visible
    .filter((row) => row.type === "expense")
    .reduce((total, row) => total - row.amountZar, 0);
  const income = visible
    .filter((row) => row.type === "income")
    .reduce((total, row) => total + row.amountZar, 0);
  const lowConfidence = all.filter((row) => row.typeConfidence === "low").length;
  const anomalies = all.filter((row) => row.signAnomaly);

  if (error) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-loss">Couldn&apos;t load transactions</p>
          <p className="mt-1.5 text-xs text-muted">{error.message}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transactions…"
            aria-label="Search transactions"
            className="h-10 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-3 text-base outline-none placeholder:text-faint focus:border-accent sm:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={15} strokeWidth={2} />
          Log
        </button>
      </div>

      <div
        role="tablist"
        aria-label="How to view transactions"
        className="scrollbar-none flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1"
      >
        {VIEWS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={view === option.key}
            onClick={() => setView(option.key)}
            className={`flex-1 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === option.key
                ? "bg-accent text-white"
                : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={types.includes(type)}
            onClick={() =>
              setTypes((current) =>
                current.includes(type)
                  ? current.filter((t) => t !== type)
                  : [...current, type],
              )
            }
            className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors ${
              types.includes(type)
                ? "border-accent/50 bg-accent/15 text-ink"
                : "border-line text-muted hover:border-line-2 hover:text-ink"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface px-4 py-3">
        <div>
          <p className="text-[11px] text-faint">Spend shown</p>
          <Money value={spend} variant="whole" className="text-sm" />
        </div>
        <div>
          <p className="text-[11px] text-faint">Income shown</p>
          <Money value={income} variant="whole" className="text-sm" />
        </div>
      </div>

      {anomalies.length > 0 ? (
        <details className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-medium text-warn">
            {anomalies.length} {anomalies.length === 1 ? "entry looks" : "entries look"}{" "}
            wrongly signed —{" "}
            <Money
              value={anomalies.reduce((t, r) => t + r.amountZar, 0)}
              variant="whole"
            />{" "}
            of spending recorded as money in
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            These are expenses entered with a positive amount. The app counts them
            as spend anyway so your budgets are correct, but the source rows are
            still wrong — fix the signs in Airtable when convenient. Nothing here
            is rewritten automatically.
          </p>
          <ul className="mt-2 space-y-1">
            {anomalies.map((row) => (
              <li key={row.recordId} className="flex justify-between gap-3 text-[11px]">
                <span className="truncate text-muted">
                  {row.date ? formatDate(row.date) : "—"} · {row.description}
                </span>
                <Money value={row.amountZar} className="shrink-0" tone="flat" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {lowConfidence > 0 ? (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
          {lowConfidence} {lowConfidence === 1 ? "entry has" : "entries have"}{" "}
          a guessed type — no Type set in Airtable and no category rule matched, so
          it&apos;s inferred from the amount. Set Type on those rows to make it certain.
        </p>
      ) : null}

      {view === "calendar" ? (
        <CalendarView
          rows={visible}
          // Tapping a day narrows the list to it, then drops you back into it —
          // a calendar you can't drill into is just decoration.
          onPickDay={(date) => {
            setQuery("");
            setDayFilter(date);
            setView("list");
          }}
        />
      ) : view === "monthly" ? (
        <MonthlyView rows={visible} />
      ) : view === "summary" ? (
        <SummaryView
          rows={visible}
          onPickCategory={(category) => {
            setDayFilter(null);
            setQuery(category);
            setView("list");
          }}
        />
      ) : (
      <Card>
        <CardHeader
          title="Ledger"
          description={
            dayFilter
              ? `${visible.length} on ${formatDate(dayFilter)}`
              : `${visible.length} of ${all.length} entries`
          }
          action={
            dayFilter ? (
              <button
                type="button"
                onClick={() => setDayFilter(null)}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium hover:bg-surface-2"
              >
                Clear day
              </button>
            ) : null
          }
        />
        {!data ? (
          <CardBody className="space-y-3 py-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div
                  className="h-3 animate-pulse rounded bg-raise"
                  style={{ width: `${60 - i * 9}%` }}
                />
                <div className="h-3 w-16 animate-pulse rounded bg-raise" />
              </div>
            ))}
          </CardBody>
        ) : all.length === 0 ? (
          // A brand-new ledger — the state every screen shows after the fresh
          // start, so it should read as a beginning, not an error.
          <CardBody className="py-10 text-center">
            <p className="text-sm font-medium">Ready when you are</p>
            <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
              Log your first transaction and the calendar, monthly view and
              summary all start filling in on their own.
            </p>
            <button
              type="button"
              onClick={() => setLogging(true)}
              className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-transform active:scale-95"
            >
              Log the first one
            </button>
          </CardBody>
        ) : visible.length === 0 ? (
          <CardBody className="py-10 text-center text-sm text-muted">
            Nothing matches that filter.
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {visible.slice(0, 200).map((row) => {
              const open = expanded === row.recordId;
              return (
              <li key={row.recordId}>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : row.recordId)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{row.description}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                    <span>{row.date ? formatDate(row.date) : "no date"}</span>
                    <span>·</span>
                    <span>{row.accountLabel ?? "unassigned"}</span>
                    {row.category ? (
                      <>
                        <span>·</span>
                        <span>{row.category}</span>
                      </>
                    ) : null}
                    <span
                      className={`capitalize ${TYPE_TONE[row.type]}`}
                      title={row.typeReason}
                    >
                      {row.type}
                      {row.typeConfidence === "low" ? "?" : ""}
                    </span>
                  </p>
                </div>
                <Money
                  value={row.amountZar}
                  className="shrink-0 text-sm"
                  tone={row.amountZar < 0 ? "flat" : "gain"}
                />
                <ChevronDown
                  size={14}
                  strokeWidth={1.75}
                  className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg/40 px-4 py-2.5">
                  <p className="text-[11px] text-faint">
                    {row.type}
                    {/* Notes are free text and often carry amounts or refs —
                        the privacy eye masks them like any figure. */}
                    {row.notes ? (
                      <>
                        {" · "}
                        <Sensitive>{row.notes}</Sensitive>
                      </>
                    ) : null}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(null)}
                      className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-ink"
                    >
                      Collapse
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          recordId: row.recordId,
                          description: row.description,
                          amountZar: row.amountZar,
                          category: row.category,
                          accountLabel: row.accountLabel,
                          date: row.date,
                          notes: row.notes,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line-2 hover:text-ink"
                    >
                      <Pencil size={12} strokeWidth={1.75} />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy === row.recordId}
                      onClick={() => remove(row.recordId, row.description)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-loss/40 hover:text-loss disabled:opacity-50"
                    >
                      <Trash2 size={12} strokeWidth={1.75} />
                      {busy === row.recordId ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ) : null}
              </li>
              );
            })}
          </ul>
        )}
      </Card>
      )}

      {view === "list" && visible.length > 200 ? (
        <p className="text-center text-[11px] text-faint">
          Showing the 200 most recent of {visible.length}. Narrow the search to see more.
        </p>
      ) : null}

      <LogTransaction
        open={logging}
        onClose={() => setLogging(false)}
        onSaved={() => void mutate()}
        accounts={home?.defaults.accounts}
        allCategories={home?.defaults.allCategories}
        kidAccounts={home?.defaults.kidAccounts}
        suggestsNewCycle={home?.defaults.suggestsNewCycle}
        suggestedCategories={home?.defaults.categories}
      />

      {editing ? (
        <LogTransaction
          key={editing.recordId}
          open
          editing={editing}
          onClose={() => setEditing(null)}
          accounts={home?.defaults.accounts}
          allCategories={home?.defaults.allCategories}
        kidAccounts={home?.defaults.kidAccounts}
        suggestsNewCycle={home?.defaults.suggestsNewCycle}
          onSaved={() => {
            setEditing(null);
            setExpanded(null);
            void mutate();
          }}
        />
      ) : null}
    </div>
  );
}
