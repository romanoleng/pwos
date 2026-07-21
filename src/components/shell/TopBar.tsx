"use client";

import { usePathname } from "next/navigation";

import { navTitleFor } from "@/lib/nav";
import { ThemeToggle } from "@/components/theme";

/**
 * Mobile-only header. Desktop gets its identity from the sidebar, so repeating
 * a title bar there would just be chrome for chrome's sake.
 */
export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md md:hidden">
      <div className="flex h-12 items-center justify-between px-4">
        <h1 className="text-sm font-semibold tracking-tight">{navTitleFor(pathname)}</h1>
        <ThemeToggle />
      </div>
    </header>
  );
}
