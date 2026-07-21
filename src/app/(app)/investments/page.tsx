import type { Metadata } from "next";
import { InvestmentsScreen } from "@/components/wealth/InvestmentsScreen";
import { PageHeader } from "@/components/ui/Card";
export const metadata: Metadata = { title: "Investments" };
export const dynamic = "force-dynamic";
export default function InvestmentsPage() {
  return (
    <>
      <PageHeader title="Investments" description="RA, TFSA, equities and property — summary balances." />
      <InvestmentsScreen />
    </>
  );
}
