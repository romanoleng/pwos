import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Transactions"
      description="Typed ledger: income, expense, transfer, contribution."
      note="Blocked: the Airtable Transactions table has no type field yet (§11). Build order step 6."
    />
  );
}
