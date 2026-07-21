import type { Metadata } from "next";
import { NetWorthScreen } from "@/components/networth/NetWorthScreen";
import { PageHeader } from "@/components/ui/Card";
export const metadata: Metadata = { title: "Net Worth" };
export const dynamic = "force-dynamic";
export default function NetWorthPage() {
  return (
    <>
      <PageHeader title="Net Worth" description="Derived live from assets, live crypto and Debt Tracker." />
      <NetWorthScreen />
    </>
  );
}
