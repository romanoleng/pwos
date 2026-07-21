import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Net Worth" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Net Worth"
      description="Derived from accounts, investments, live crypto and liabilities."
      note="Derived — never hand-maintained (§3). Build order step 7."
    />
  );
}
