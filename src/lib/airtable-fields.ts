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
    /** Checkbox. Set by PWOS to hide a position without deleting it (§9b). */
    archived: "fldkPq3xjJOY9sCFe",
    m1: "fld4U4jh59SsEne85",
    m2: "fldHIGHprVYvejSvC",
    m3: "fld7oVYZ3SpV5Bw9P",
    m4: "fldNJ5K4VtW8uWEHZ",
    m5: "fld5SNCiJPQPOP8E8",
  },
  transactions: {
    description: "fldkv75saQVcniLIk",
    amount: "fldrJ6f3gt0PwbJgC",
    category: "fldhsDTulqpR7MdtA",
    account: "fldsoRG39bewZ2MWC",
    date: "fldT6wzkOhs44yJ1x",
    notes: "fldvh7XMPP3aQtyV3",
    /** singleSelect: income | expense | transfer | contribution (§3). */
    type: "fldYkglPU3oyakl93",
  },
  netWorth: {
    name: "fldfxiUQZvJxyTu0f",
    category: "fldBS5N3nnYVMCQ3q",
    type: "fldGCrLxFR8XIwxZB",
    valueZar: "fldqBv7liYBBOQ3Lz",
    notes: "fldzTawYXUivHbh8F",
    lastUpdated: "fld13UXcF9zmMxxXw",
  },
  debt: {
    name: "fld19zodyvt0yKC1P",
    type: "fldgVTyiDZrS8Brhd",
    balanceZar: "fldyDq6KrUTl0MQgt",
    monthlyZar: "fldRylhwh9GUkXciS",
    interestPct: "fldZwbE4Ei51vVnm2",
    priority: "fld9HFlI1tDIedwBJ",
    status: "fldxbXjuQeD4F9xpH",
    payoffDate: "fldpRkJrHVVd21Vf4",
    notes: "fldgVYqZ1kBUGDUnv",
  },
  budget: {
    category: "fld1QIml3qV4jGEpd",
    type: "fldGbX8xaJD4MtfM8",
    budgetedZar: "fldl87k7XXfFuzN2K",
    actualZar: "fldkfB2EJKlHYCGIN",
    month: "fldHh2t1v4qfuffhy",
    priority: "fld1NDKCYIKWUgxQk",
    notes: "fld8IL0p2VKGpmRAJ",
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
