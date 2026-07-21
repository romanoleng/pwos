import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Wealth Overview" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Wealth Overview"
      description="Consolidated wealth by class and entity."
      note="Builds after the Airtable client lands (CLAUDE.md §8 step 7)."
    />
  );
}
