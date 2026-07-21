import type { Metadata } from "next";
import { GoalsScreen } from "@/components/goals/GoalsScreen";
import { PageHeader } from "@/components/ui/Card";
export const metadata: Metadata = { title: "Goals" };
export const dynamic = "force-dynamic";
export default function GoalsPage() {
  return (
    <>
      <PageHeader title="Goals" description="The freedom number, savings goals and the kids' accounts." />
      <GoalsScreen />
    </>
  );
}
