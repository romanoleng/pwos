import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Accounts" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Accounts"
      description="Cash accounts across personal, business and family."
      note="Build order step 6."
    />
  );
}
