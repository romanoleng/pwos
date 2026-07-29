import type { Metadata } from "next";

import { DataCheckReport } from "@/components/settings/DataCheckReport";
import { PageHeader } from "@/components/ui/Card";
import { getDataCheck } from "@/lib/server/datacheck";

export const metadata: Metadata = { title: "Data check" };
export const dynamic = "force-dynamic";

export default async function DataCheckPage() {
  const data = await getDataCheck();
  return (
    <>
      <PageHeader
        title="Data check"
        description="Every recent log, and whether it's landing where you expect. If a spend isn't showing on a budget line, this says why."
      />
      <DataCheckReport data={data} />
    </>
  );
}
