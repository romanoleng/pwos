import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Goals" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Goals"
      description="Freedom goal, savings goals and coin accumulation."
      note="Build order step 6."
    />
  );
}
