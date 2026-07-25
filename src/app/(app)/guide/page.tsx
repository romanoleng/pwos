import type { Metadata } from "next";

import { GuideScreen } from "@/components/guide/GuideScreen";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Guide" };

export default function GuidePage() {
  return (
    <>
      <PageHeader
        title="Guide"
        description="How the app works, what's new, and the thinking behind it."
      />
      <GuideScreen />
    </>
  );
}
