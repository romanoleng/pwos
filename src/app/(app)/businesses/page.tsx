import type { Metadata } from "next";
import { BusinessesScreen } from "@/components/wealth/BusinessesScreen";
import { PageHeader } from "@/components/ui/Card";
export const metadata: Metadata = { title: "Businesses" };
export const dynamic = "force-dynamic";
export default function BusinessesPage() {
  return (
    <>
      <PageHeader title="Businesses" description="CreativeDigital." />
      <BusinessesScreen />
    </>
  );
}
