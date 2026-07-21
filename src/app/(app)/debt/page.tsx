import type { Metadata } from "next";
import { DebtScreen } from "@/components/debt/DebtScreen";
import { PageHeader } from "@/components/ui/Card";
export const metadata: Metadata = { title: "Debt" };
export const dynamic = "force-dynamic";
export default function DebtPage() {
  return (
    <>
      <PageHeader title="Debt" description="What you owe, in the order worth clearing it." />
      <DebtScreen />
    </>
  );
}
