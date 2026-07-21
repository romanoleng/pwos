"use client";

import useSWR from "swr";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import type { ReportsSummary } from "@/lib/server/reports";

async function fetcher(url: string): Promise<ReportsSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not build reports.");
  return response.json();
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  month: "long",
  year: "numeric",
});

export function ReportsScreen() {
  const { data, error } = useSWR<ReportsSummary>("/api/reports", fetcher);
  if (error) return <Card><CardBody className="text-sm text-loss">Couldn&apos;t build reports.</CardBody></Card>;
  if (!data) return <Card><CardBody className="py-10 text-center text-sm text-muted">Loading…</CardBody></Card>;

  return (
    <div className="space-y-4">
      {data.months.map((month) => {
        const label = MONTH_LABEL.format(new Date(`${month.month}-01T12:00:00Z`));
        return (
          <Card key={month.month}>
            <CardHeader
              title={label}
              description={`${month.transactionCount} entries`}
              action={
                <div className="text-right">
                  <Money value={month.netZar} variant="whole" signed className="text-sm" />
                  <p className="text-[11px] text-faint">net</p>
                </div>
              }
            />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Income"><Money value={month.incomeZar} variant="whole" /></Stat>
                <Stat label="Spend"><Money value={month.spendZar} variant="whole" /></Stat>
                <Stat label="Transfers"><Money value={month.transferZar} variant="whole" /></Stat>
                <Stat label="Invested"><Money value={month.contributionZar} variant="whole" /></Stat>
              </dl>
              {month.topCategories.length > 0 ? (
                <ul className="mt-4 space-y-1 border-t border-line pt-3">
                  {month.topCategories.map((category) => (
                    <li key={category.category} className="flex justify-between gap-3 text-[11px]">
                      <span className="text-muted">{category.category}</span>
                      <Money value={category.amountZar} variant="whole" className="text-muted" />
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>
        );
      })}
      <p className="text-[11px] leading-relaxed text-faint">
        Spend excludes transfers and contributions, which are shown separately. Months
        are calendar months here; budgets run 24th to 24th.
      </p>
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
