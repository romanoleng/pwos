import type { Metadata } from "next";

import { GoalsScreen } from "@/components/goals/GoalsScreen";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Savings" };
export const dynamic = "force-dynamic";

export default function SavingsPage() {
  return (
    <>
      <PageHeader
        title="Savings"
        description="Everything you're building — goals, accounts, the monthly plan, and the kids' cash."
      />
      <GoalsScreen />
    </>
  );
}
