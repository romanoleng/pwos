import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { THEME_INIT_SCRIPT } from "@/components/theme";
import { NAV_INIT_SCRIPT } from "@/lib/navPosition";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PWOS",
    template: "%s · PWOS",
  },
  description: "Personal Wealth Operating System",
  manifest: "/manifest.webmanifest",
  applicationName: "PWOS",
  appleWebApp: {
    capable: true,
    title: "PWOS",
    statusBarStyle: "black-translucent",
  },
  other: {
    // Next only emits the modern `mobile-web-app-capable`; older iOS Safari
    // still reads the apple- prefixed one, and standalone display is the
    // whole point (Romano's ask, 2026-07-23).
    "apple-mobile-web-app-capable": "yes",
  },
  // Private tool — keep it out of every index, not that it's reachable anyway.
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    // Matches the default themes' --bg: Midnight navy and Ledger neutral.
    { media: "(prefers-color-scheme: dark)", color: "#070b14" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
  width: "device-width",
  initialScale: 1,
  // Lets the app paint under the status bar / home indicator when installed.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA" suppressHydrationWarning className={`${inter.variable} h-full`}>
      <head>
        {/* Must run before paint — see THEME_INIT_SCRIPT / NAV_INIT_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: NAV_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
