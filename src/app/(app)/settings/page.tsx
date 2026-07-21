import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <ModulePlaceholder
      title="Settings"
      description="Theme, locale and preferences."
      note="Theme toggle already lives in the sidebar and mobile header. Build order step 7."
    />
  );
}
