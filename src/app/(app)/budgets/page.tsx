import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Budgets" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Budgets"
      description="Cycle runs 24th to 24th. Real expenses only."
      note="Transfers and contributions never count as spend (§3). Build order step 6."
    />
  );
}
