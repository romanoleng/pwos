/**
 * Net Worth — derived, not hand-maintained (CLAUDE.md §3).
 *
 * The Net Worth table's own crypto rows were already ~R11k stale when checked,
 * which is exactly why §3 requires computing this live: assets from the ledger
 * plus live crypto, liabilities from Debt Tracker as the single source.
 */
import "server-only";

import { FIELDS, TABLES } from "@/lib/airtable-fields";

import { listRecords, numberCell, stringCell } from "./airtable";
import { getDebtSummary } from "./debt";
import { getPortfolio } from "./crypto";

export type NetWorthClass = {
  category: string;
  valueZar: number;
  /** True when the figure is computed live rather than read from a stored row. */
  live: boolean;
  rows: { recordId: string; name: string; valueZar: number }[];
};

export type NetWorthSummary = {
  assetsZar: number;
  liabilitiesZar: number;
  netZar: number;
  classes: NetWorthClass[];
  /** Liabilities, with flagged duplicates counted once. */
  dedupedLiabilitiesZar: number;
  dedupedNetZar: number;
  duplicateOvercountZar: number;
  /** What the stored Net Worth table says, for comparison. */
  storedCryptoZar: number;
  liveCryptoZar: number;
};

export async function getNetWorth(): Promise<NetWorthSummary> {
  const [records, debt, portfolio] = await Promise.all([
    listRecords(TABLES.netWorth, {
      fieldIds: [FIELDS.netWorth.name, FIELDS.netWorth.category, FIELDS.netWorth.type, FIELDS.netWorth.valueZar],
    }),
    getDebtSummary(),
    getPortfolio(),
  ]);

  const byCategory = new Map<string, NetWorthClass>();
  let storedCryptoZar = 0;

  for (const record of records) {
    const type = stringCell(record, FIELDS.netWorth.type);
    // Liabilities come from Debt Tracker, the single source (§3). Including the
    // Net Worth liability rows too would double-count the same obligations.
    if (type !== "Asset") continue;

    const category = stringCell(record, FIELDS.netWorth.category) ?? "Other";
    const name = stringCell(record, FIELDS.netWorth.name) ?? "—";
    const valueZar = numberCell(record, FIELDS.netWorth.valueZar) ?? 0;

    if (category === "Crypto") {
      // Superseded by the live portfolio below.
      storedCryptoZar += valueZar;
      continue;
    }

    const existing = byCategory.get(category) ?? {
      category,
      valueZar: 0,
      live: false,
      rows: [],
    };
    existing.valueZar += valueZar;
    existing.rows.push({ recordId: record.id, name, valueZar });
    byCategory.set(category, existing);
  }

  const liveCryptoZar = portfolio.totals.valueZar;
  byCategory.set("Crypto", {
    category: "Crypto",
    valueZar: liveCryptoZar,
    live: true,
    rows: [],
  });

  const classes = [...byCategory.values()].sort((a, b) => b.valueZar - a.valueZar);
  const assetsZar = classes.reduce((total, entry) => total + entry.valueZar, 0);
  const liabilitiesZar = debt.totalZar;
  const duplicateOvercountZar = debt.totalZar - debt.dedupedTotalZar;

  return {
    assetsZar,
    liabilitiesZar,
    netZar: assetsZar - liabilitiesZar,
    classes,
    dedupedLiabilitiesZar: debt.dedupedTotalZar,
    dedupedNetZar: assetsZar - debt.dedupedTotalZar,
    duplicateOvercountZar,
    storedCryptoZar,
    liveCryptoZar,
  };
}
