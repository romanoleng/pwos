import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Crypto" };

export default function CryptoPage() {
  return (
    <ModulePlaceholder
      title="Crypto"
      description="Live portfolio, wallets, Core 5 and the milestone engine."
      note="Next up — this is the flagship module (CLAUDE.md §5) and the first thing built against live data, once you've confirmed the shell and sign-in feel right."
    />
  );
}
