import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { THEME_INIT_SCRIPT } from "@/components/theme";

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
  // Private tool — keep it out of every index, not that it's reachable anyway.
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
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
        {/* Must run before paint — see THEME_INIT_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
