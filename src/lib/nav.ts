/**
 * Navigation model — one definition, two presentations (CLAUDE.md §6):
 * bottom tabs on mobile, sidebar on desktop.
 *
 * No server imports: this is consumed by client components.
 */
import {
  Bitcoin,
  BookOpen,
  Briefcase,
  ChartPie,
  CreditCard,
  ChartColumn,
  Home,
  Landmark,
  ListChecks,
  Lock,
  Receipt,
  RefreshCw,
  PiggyBank,
  Scale,
  Settings,
  Shapes,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the sidebar; bottom tabs use `label`. */
  longLabel?: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/wealth", label: "Wealth", icon: ChartPie, longLabel: "Wealth Overview" },
      { href: "/net-worth", label: "Net Worth", icon: Scale },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/accounts", label: "Accounts", icon: Landmark },
      { href: "/transactions", label: "Transactions", icon: Receipt },
      { href: "/budgets", label: "Budgets", icon: Wallet },
      { href: "/savings", label: "Savings", icon: PiggyBank },
      { href: "/reset", label: "Reset", icon: RefreshCw, longLabel: "Payday reset" },
    ],
  },
  {
    title: "Invest",
    items: [
      { href: "/investments", label: "Investments", icon: TrendingUp },
      { href: "/crypto", label: "Crypto", icon: Bitcoin },
    ],
  },
  {
    title: "Obligations",
    items: [{ href: "/debt", label: "Debt", icon: CreditCard }],
  },
  {
    title: "Business",
    items: [{ href: "/businesses", label: "Businesses", icon: Briefcase }],
  },
  {
    title: "More",
    items: [
      { href: "/stats", label: "Stats", icon: ChartColumn, longLabel: "Stats" },
      { href: "/data-check", label: "Data check", icon: ListChecks, longLabel: "Data check" },
      { href: "/vault", label: "Vault", icon: Lock, longLabel: "Vault · preview" },
      { href: "/guide", label: "Guide", icon: BookOpen },
      { href: "/settings", label: "Settings", icon: Settings },
      // Not a tab or sidebar entry — reached from Settings — but listed so the
      // mobile header can title it.
      { href: "/settings/categories", label: "Categories", icon: Shapes },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Longest-prefix match so /crypto/BTC still highlights the Crypto tab. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item whose href best matches the path (longest prefix wins). */
export function navItemFor(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.filter((item) => isActivePath(pathname, item.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

export function navTitleFor(pathname: string): string {
  const match = navItemFor(pathname);
  return match?.longLabel ?? match?.label ?? "PWOS";
}
