/**
 * Lisa's and Liam's accounts.
 *
 * Each child holds two different kinds of money: cash they could draw on
 * (a Capitec account, a 32-day notice) and money locked away for decades
 * (retirement annuity, tax-free savings, an EasyEquities share account).
 * Showing them as one list makes a R250 notice deposit look like the same
 * kind of thing as a retirement annuity, so the two are kept apart.
 *
 * The split is by account type rather than by institution: EasyEquities hosts
 * all three investment accounts, so the institution says nothing useful here.
 */

/** Long-horizon accounts — these belong on Investments. */
export const KID_INVESTMENT_TYPES = [
  "Retirement Annuity",
  "TFSA",
  "Investments",
] as const;

export type KidAccountLike = {
  child: string | null;
  accountType?: string | null;
  account: string;
  balanceZar: number;
  monthlyZar: number;
};

/**
 * Unknown types count as savings, not investments. Mislabelling a locked-away
 * account as spendable cash is the safer of the two mistakes: it understates
 * what is invested rather than implying money is reachable when it isn't.
 */
export function isKidInvestment(accountType: string | null | undefined): boolean {
  if (!accountType) return false;
  return (KID_INVESTMENT_TYPES as readonly string[]).includes(accountType);
}

export type KidGroup<T> = {
  child: string;
  accounts: T[];
  balanceZar: number;
  monthlyZar: number;
};

/**
 * Group per child, biggest balance first within each. Children are ordered by
 * name so the sections never reshuffle when a balance changes — a list that
 * reorders itself under your thumb is a list you stop trusting.
 */
export function groupByChild<T extends KidAccountLike>(accounts: T[]): KidGroup<T>[] {
  const byChild = new Map<string, T[]>();
  for (const account of accounts) {
    const child = account.child?.trim() || "Unassigned";
    const list = byChild.get(child) ?? [];
    list.push(account);
    byChild.set(child, list);
  }

  return [...byChild.entries()]
    .map(([child, list]) => ({
      child,
      accounts: [...list].sort((a, b) => b.balanceZar - a.balanceZar),
      balanceZar: list.reduce((total, a) => total + a.balanceZar, 0),
      monthlyZar: list.reduce((total, a) => total + a.monthlyZar, 0),
    }))
    .sort((a, b) => a.child.localeCompare(b.child));
}
