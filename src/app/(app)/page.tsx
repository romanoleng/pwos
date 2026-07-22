import { HomeScreen } from "@/components/home/HomeScreen";
import { PageHeader } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" description="What you can spend, and what you just spent." />
      <HomeScreen />
    </>
  );
}
