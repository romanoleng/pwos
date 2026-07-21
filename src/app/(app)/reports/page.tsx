import type { Metadata } from "next";
import { ReportsScreen } from "@/components/reports/ReportsScreen";
import { PageHeader } from "@/components/ui/Card";
export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";
export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Month by month, from your typed ledger." />
      <ReportsScreen />
    </>
  );
}
