import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Businesses" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Businesses"
      description="CreativeDigital profile."
      note="Basic profile in V1 (§4). Build order step 7."
    />
  );
}
