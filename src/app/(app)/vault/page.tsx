import type { Metadata } from "next";

import { VaultPreview } from "@/components/vault/VaultPreview";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Vault" };

export default function VaultPage() {
  return (
    <>
      <PageHeader
        title="Vault"
        description="Where everything is and what to do — for the people you trust, when they need it."
      />
      <VaultPreview />
    </>
  );
}
