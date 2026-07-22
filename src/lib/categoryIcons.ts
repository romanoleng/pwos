import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Bitcoin,
  Briefcase,
  Car,
  ChefHat,
  Cigarette,
  CreditCard,
  Dices,
  Fuel,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  PiggyBank,
  Popcorn,
  ReceiptText,
  Shield,
  Shirt,
  ShoppingCart,
  Store,
  Tag,
  TrendingUp,
  Tv,
  UtensilsCrossed,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * An icon per category (Fable pass — Romano chose auto-assign).
 *
 * Keyword-matched from the name rather than stored, so renames keep sensible
 * icons and new categories get one for free. When he wants to override a
 * specific one, that's a nullable column on categories and a picker in the
 * Category Manager — the stored name would simply win over the keyword here.
 *
 * Matching is on fragments so "Groceries", "Grocery run" and "Checkers
 * groceries" all land on the cart. First match wins; order the specific
 * before the general.
 */
const RULES: [string, LucideIcon][] = [
  ["grocer", ShoppingCart],
  ["kiosk", Store],
  ["petrol", Fuel],
  ["fuel", Fuel],
  ["transport", Fuel],
  ["eating", UtensilsCrossed],
  ["meal", ChefHat],
  ["restaurant", UtensilsCrossed],
  ["subscription", Tv],
  ["internet", Wifi],
  ["electric", Zap],
  ["bond", House],
  ["home", House],
  ["levies", Landmark],
  ["rates", Landmark],
  ["medical", HeartPulse],
  ["health", HeartPulse],
  ["clothing", Shirt],
  ["shoes", Shirt],
  ["cigarette", Cigarette],
  ["smoke", Cigarette],
  ["betting", Dices],
  ["lottery", Dices],
  ["bank fee", Banknote],
  ["payflex", CreditCard],
  ["payjustnow", CreditCard],
  ["debt", CreditCard],
  ["lisa", Baby],
  ["liam", Baby],
  ["kids", Baby],
  ["education", GraduationCap],
  ["tfsa", GraduationCap],
  ["entertain", Popcorn],
  ["crypto", Bitcoin],
  ["invest", TrendingUp],
  ["saving", PiggyBank],
  ["emergency", Shield],
  ["car", Car],
  ["tax", ReceiptText],
  ["sars", ReceiptText],
  ["business", Briefcase],
  ["income", Briefcase],
  ["interest", Landmark],
  ["allowance", HandCoins],
  ["transfer", ArrowLeftRight],
];

export function iconForCategory(name: string | null | undefined): LucideIcon {
  if (!name) return Tag;
  const needle = name.toLowerCase();
  for (const [fragment, icon] of RULES) {
    if (needle.includes(fragment)) return icon;
  }
  return Tag;
}
