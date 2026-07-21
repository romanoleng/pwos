import { HomeScreen } from "@/components/home/HomeScreen";
import { PageHeader } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" description="Where the money actually stands." />
      <HomeScreen />
    </>
  );
}
