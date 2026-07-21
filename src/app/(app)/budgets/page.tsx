import type { Metadata } from "next";

import { BudgetScreen } from "@/components/budget/BudgetScreen";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Budgets" };
export const dynamic = "force-dynamic";

export default function BudgetsPage() {
  return (
    <>
      <PageHeader
        title="Budgets"
        description="Cycle runs 24th to 24th. Real expenses only."
      />
      <BudgetScreen />
    </>
  );
}
