import type { Metadata } from "next";

import { ResetScreen } from "@/components/reset/ResetScreen";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Payday reset" };
export const dynamic = "force-dynamic";

export default function ResetPage() {
  return (
    <>
      <PageHeader
        title="Payday reset"
        description="Bring every balance in line with reality, in one pass."
      />
      <ResetScreen />
    </>
  );
}
