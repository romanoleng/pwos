/**
 * Navigation model — one definition, two presentations (CLAUDE.md §6):
 * bottom tabs on mobile, sidebar on desktop.
 *
 * No server imports: this is consumed by client components.
 */
import {
  Banknote,
  Bitcoin,
  Briefcase,
  ChartPie,
  CreditCard,
  FileText,
  Home,
  Landmark,
  MoreHorizontal,
  Receipt,
  Scale,
  Settings,
  Target,
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
      { href: "/goals", label: "Goals", icon: Target },
    ],
  },
  {
    title: "Invest",
    items: [
      { href: "/crypto", label: "Crypto", icon: Bitcoin },
      { href: "/investments", label: "Investments", icon: TrendingUp },
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
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * Five is the ceiling for a thumb-reachable tab bar. These are the screens
 * worth opening daily; everything else lives behind "More".
 */
export const TAB_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
  { href: "/accounts", label: "Accounts", icon: Banknote },
  { href: "/budgets", label: "Budget", icon: Wallet },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

/** Longest-prefix match so /crypto/BTC still highlights the Crypto tab. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navTitleFor(pathname: string): string {
  const match = ALL_NAV_ITEMS.filter((item) => isActivePath(pathname, item.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.longLabel ?? match?.label ?? "PWOS";
}
