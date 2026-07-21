import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Debt" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Debt"
      description="Payoff priorities, balances and target dates."
      note="Must de-duplicate the Anders / MBD Legal debt-review entry (§3). Build order step 7."
    />
  );
}
