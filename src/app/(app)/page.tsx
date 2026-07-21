import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { FREEDOM_TARGET_ZAR, FREEDOM_TARGET_LABEL } from "@/lib/constants";
import { formatMoneyWhole } from "@/lib/format";

/**
 * Home — the freedom number is the centrepiece (CLAUDE.md §5).
 *
 * Deliberately shows no figures yet: the numbers land once the Airtable and
 * price clients exist (build order steps 3–5). A placeholder with invented
 * values would be worse than an empty one.
 */
export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" description="Where the money actually stands." />

      <Card>
        <CardBody className="py-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Freedom number · {FREEDOM_TARGET_LABEL}
          </p>
          <p className="tnum mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
            {formatMoneyWhole(FREEDOM_TARGET_ZAR)}
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Clears the home loan, wipes the debt review and the smaller debts, and
            puts the family in a new car.
          </p>

          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-raise">
            <div className="h-full w-0 rounded-full bg-accent" />
          </div>
          <p className="mt-2 text-xs text-faint">
            Progress appears once the Airtable and price clients are wired up.
          </p>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody>
          <p className="text-sm font-medium">Crypto is next</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            The flagship module is the first thing being built against live data —
            holdings by wallet, Core 5, the M1–M5 milestone engine, movers and charts.
          </p>
          <Link
            href="/crypto"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            Open Crypto
            <ArrowRight size={13} strokeWidth={2} />
          </Link>
        </CardBody>
      </Card>
    </>
  );
}
