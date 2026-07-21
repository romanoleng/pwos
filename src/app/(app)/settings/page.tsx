import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { PageHeader } from "@/components/ui/Card";
export const metadata: Metadata = { title: "Settings" };
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Preferences, and where each number comes from." />
      <SettingsScreen />
    </>
  );
}
