import type { Metadata } from "next";

import { AccountsScreen } from "@/components/accounts/AccountsView";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

export default function AccountsPage() {
  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every account, what's in it, and what you can actually spend."
      />
      <AccountsScreen />
    </>
  );
}
