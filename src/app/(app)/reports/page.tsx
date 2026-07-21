import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Reports"
      description="Monthly summary."
      note="Basic in V1 (§5). Build order step 7."
    />
  );
}
