import type { Metadata } from "next";

import { StatsScreen } from "@/components/stats/StatsScreen";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Stats" };
// The screen reads the period from the URL via useSearchParams, which can't be
// statically prerendered. Every other data screen is force-dynamic for the same
// reason; leaving it off failed the production build without failing dev.
export const dynamic = "force-dynamic";

export default function StatsPage() {
  return (
    <>
      <PageHeader
        title="Stats"
        description="Where money comes from, and where it goes."
      />
      <StatsScreen />
    </>
  );
}
