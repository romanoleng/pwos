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
        description="Runs payday to payday. Spending only — money you put away is planned on Savings."
      />
      <BudgetScreen />
    </>
  );
}
