import type { Metadata } from "next";

import { CryptoDashboard } from "@/components/crypto/CryptoDashboard";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Crypto" };

/** Prices are live, so nothing on this route may be prerendered at build time. */
export const dynamic = "force-dynamic";

export default function CryptoPage() {
  return (
    <>
      <PageHeader
        title="Crypto"
        description="Live portfolio, wallets, Core 5 and the milestone engine."
      />
      {/*
        Rendered client-side from /api/crypto/portfolio rather than server-fetched
        into props: one code path for the first paint and every 60s poll after it,
        so the screen can never show a stale server render beside a live number.
      */}
      <CryptoDashboard />
    </>
  );
}
