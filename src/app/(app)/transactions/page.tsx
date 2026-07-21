import type { Metadata } from "next";

import { TransactionsScreen } from "@/components/transactions/TransactionsScreen";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Log what you spend, as you spend it."
      />
      <TransactionsScreen />
    </>
  );
}
