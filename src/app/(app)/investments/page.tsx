import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Investments" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Investments"
      description="RA, TFSA, equities, EasyProperties, Family Future."
      note="Summary balances in V1 (§5). Build order step 7."
    />
  );
}
