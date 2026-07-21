/**
 * Airtable table and field ids (CLAUDE.md §3, verified live 2026-07-21).
 *
 * Deliberately NOT in the server-only client: these are opaque identifiers,
 * not secrets, and the UI needs them to read a snapshot preview payload.
 * Keeping them here means importing an id can never drag the Airtable token
 * into a client bundle.
 */

/** Table ids (CLAUDE.md §3, verified live 2026-07-21). */
export const TABLES = {
  netWorth: "tblYdUqI6nZ12tC3N",
  holdings: "tbl7OpIaEv33NJLi6",
  transactions: "tblTjpHJr5ZtRTJ7i",
  budget: "tblSufyNfR65shnBt",
  financeLiveState: "tblMQL5IY55TIVu2W",
  savingsGoals: "tblTXNkBx8K7nfIhl",
  debtTracker: "tblST3fTejbm3yAsB",
  kidsAccounts: "tbliHyrFGyWNaamF0",
  marketData: "tblMDxJG8FyYZuYtH",
  dailyCryptoReport: "tblOnIdrw4iv2Mfun",
  snapshots: "tblLh1ZFJF3U7ekOi",
} as const;

/** Field ids, grouped by table. Verified against the live schema. */
export const FIELDS = {
  holdings: {
    coin: "fldo3Eg3vBtWlixRX",
    symbol: "fldL9NuokO2cANhAV",
    wallet: "fldpH542CYdy56BZp",
    quantity: "fldFTp6MuMerf8vnn",
    investedZar: "fldt9tKeDy3YGtHkg",
    priceZar: "fld5bv5V8vtj3ahQ9",
    valueZar: "fldtxDMMWr8Dx5Y5W",
    pnlZar: "fldaRSeSZjtaLxelQ",
    returnPct: "fldoGnlgLLcgOYHt4",
    avgBuyZar: "fldKa4sOkDpaS5F29",
    weightPct: "fld9qF4zqfYfCcY87",
    status: "fld4Za8pm5p82Pm50",
    category: "fldwAAwKWdBSAx30j",
    notes: "fldy6RjKLN5iubSF5",
    m1: "fld4U4jh59SsEne85",
    m2: "fldHIGHprVYvejSvC",
    m3: "fld7oVYZ3SpV5Bw9P",
    m4: "fldNJ5K4VtW8uWEHZ",
    m5: "fld5SNCiJPQPOP8E8",
  },
  marketData: {
    coin: "fld16hk0Hxqjax3gP",
    symbol: "fldJRC8s6xHzW5XVi",
    priceUsd: "fldTWcWMoFv2dCxxk",
    change24h: "fld6BEaHSghs0tAVR",
    change7d: "fldNlhkJpV6Ikictk",
    sector: "fldUHHMpuxK5RehtW",
    coingeckoId: "fldrYwKFTItHLIaAF",
  },
  snapshots: {
    date: "fldGPrapbeFU1M8mr",
    totalValueUsd: "flduj9mEMUNjhwcXf",
    totalInvestedUsd: "fldJuxYUB5FI4Fsi8",
    totalPnlUsd: "fld0RfkomdeRxRNqZ",
    totalReturnPct: "fldtkDdC5xHC3r4gu",
    btcPrice: "fldS9nti5RWKADrHC",
    ethPrice: "fldqfIsxeLejpKY3w",
    notes: "fldpaCwB3zwlHOR61",
  },
  dailyCryptoReport: {
    date: "flde9cM9OdDfVj4il",
    totalValueZar: "fldKdijwPzixgP53m",
    totalInvestedZar: "fldCMADS5e3Am6104",
    pnlZar: "fldS2g1AwXCq5O4LN",
    r2mProgressPct: "fldt6wuGS43Vv2z8C",
    r3mProgressPct: "fldpnRsRRogXKdBW7",
    milestonesHitCount: "fldKd0NGPlMW0kjhL",
    milestonesHitDetail: "fldkOGGPR4YJSj2Fl",
    closeCallsCount: "fldAt4aR6huZn458a",
    closeCallsDetail: "flduycQyfkuaWGjhw",
    topGainer: "fld94gmFx1XSwHu7U",
    topGainerPct: "fldhxc45qB4N8SydS",
    topGainerPriceZar: "flde9C0N9RAXBfj2R",
    topLoser: "fldTfGayxyLUjW5Of",
    topLoserPct: "fldLKj3Fv6Zt4tZCT",
    topLoserPriceZar: "fldutaRpK26xff8u8",
    allMoversDetail: "fldxCcxvxwJMtaRZG",
  },
} as const;
