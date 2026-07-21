import type { Metadata } from "next";
import { WealthScreen } from "@/components/wealth/WealthScreen";
import { PageHeader } from "@/components/ui/Card";
export const metadata: Metadata = { title: "Wealth Overview" };
export const dynamic = "force-dynamic";
export default function WealthPage() {
  return (
    <>
      <PageHeader title="Wealth Overview" description="Everything you own against everything you owe." />
      <WealthScreen />
    </>
  );
}
