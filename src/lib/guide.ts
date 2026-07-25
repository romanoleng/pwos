/**
 * The in-app Guide (Romano's ask, 2026-07-25). Three layers, one hub:
 *   - HELP        — plain-language "how each screen works", for Romano and,
 *                   crucially, for anyone who opens the vault after him.
 *   - CHANGELOG   — what got built, newest first; also feeds the daily brief.
 *   - UNDER_HOOD  — the "why" behind the app, in readable English.
 *
 * This lives in the repo next to the code ON PURPOSE. Help that outlives its
 * feature is worse than none — CLAUDE.md has the receipt (seven screens that
 * still claimed writes went to Airtable long after they didn't). So this is
 * updated in the same change as the feature it describes, and GUIDE_UPDATED is
 * bumped when it is.
 *
 * No server imports — this is plain data a client component renders.
 */

export type GuideBlock = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type ChangelogEntry = {
  date: string;
  title: string;
  points: string[];
};

/** Bumped whenever the content below changes, so the stamp can be trusted. */
export const GUIDE_UPDATED = "2026-07-25";

export const HELP: GuideBlock[] = [
  {
    heading: "The daily brief",
    paragraphs: [
      "The card at the top of Home greets you once a day with what matters — what's spendable, your per-day pace, how crypto moved, and days to payday.",
      "It's built once each morning from your live figures, so it costs almost nothing to run. Change the voice (Coach, Analyst or Gentle) and what it covers in Settings → Daily brief. Tap the ✕ to dismiss it; it's back tomorrow.",
    ],
  },
  {
    heading: "Logging a spend",
    paragraphs: [
      "Tap the + (or Log). Type the amount first — it's the only thing you always need. The account and date fill in with smart defaults, and the one-tap chips are the categories you actually use.",
      "Capture now, tidy later. You can always open an entry from Recent to edit it.",
    ],
  },
  {
    heading: "Accounts and what “spendable” means",
    paragraphs: [
      "Your cards and their balances. “Available to spend” counts only the accounts marked spendable — Capitec Main and GOtyme — so the number answers “what can I spend right now?”",
      "Business and savings are deliberately left out of that figure, though they're still one tap away.",
    ],
  },
  {
    heading: "Transfers vs contributions",
    paragraphs: [
      "Moving money isn't spending, and the app keeps them separate so your budget stays honest:",
    ],
    bullets: [
      "Transfer — moves cash between your own accounts. Both balances update; it's not a loss.",
      "Contribution — puts money into a goal or investment (a crypto buy is a contribution). The source drops, the destination rises.",
      "Only real expenses count as budget spend — transfers and contributions never do.",
    ],
  },
  {
    heading: "The budget cycle and payday",
    paragraphs: [
      "Your month runs the 24th to the 24th, because payday is the 24th. “Budget left” and the per-day allowance are always for the current cycle.",
      "Budgets reflect real expenses only, and you can edit any budget line's amount inline as the month teaches you.",
    ],
  },
  {
    heading: "The payday reset (Fresh start)",
    paragraphs: [
      "When your salary lands, Settings → Fresh start begins a new cycle from that date so the app feels newly installed for spending.",
      "Your balances stay — the reset clears the slate for a new month, it does not wipe your savings. Older history is hidden, not deleted, so you can still answer a question from a creditor later.",
    ],
  },
  {
    heading: "Debt and the debt review",
    paragraphs: [
      "Your creditors, balances and monthly commitments in one place.",
      "Some balances under debt review are best-estimates and are marked as such, with an “of which estimated” figure, so a guess never looks like a statement. A possible duplicate (Anders / MBD) is flagged for you to confirm — never silently merged.",
    ],
  },
  {
    heading: "Crypto — your portfolio",
    paragraphs: [
      "Your holdings by wallet with live prices, profit/loss in rand and %, and each coin's weight. Prices refresh about every minute.",
      "The P&L is measured only over positions that have a cost basis and a price, so it's never softened by gaps — if a coin shows R0 invested, its cost basis just hasn't been entered yet.",
    ],
  },
  {
    heading: "Core 5",
    paragraphs: [
      "BTC, ETH, XRP, HBAR and ENA — the only coins getting fresh monthly money (your DCA on the 24th). Everything else is held, not added to.",
    ],
  },
  {
    heading: "Milestones (M1–M5)",
    paragraphs: [
      "Your own sell/keep plan for each coin. The app shows how close a coin is to its next trigger and quotes your recorded instruction — it never invents targets.",
    ],
    bullets: [
      "M4 is the peak / euphoria sell — the big one.",
      "M5 is the hard February-2028 full exit, no exceptions.",
      "No breakeven sells. Milestone discipline is the whole point.",
    ],
  },
  {
    heading: "Logging a crypto buy",
    paragraphs: [
      "Crypto → Log a buy. Enter the coin, how many you bought, the rand you spent, and which account it came from.",
      "It adds to your existing position and records where the money came from — so nothing is a hand-calculated total, and the money's path stays visible.",
    ],
  },
  {
    heading: "Net worth",
    paragraphs: [
      "Worked out live from your accounts, investments, live crypto and debts — never hand-typed.",
      "It's honest by design: it can read negative while debt outweighs your assets, and the app won't dress that up.",
    ],
  },
  {
    heading: "The freedom number",
    paragraphs: [
      "R2,000,000 by February 2028 — the number that clears the home loan and the debt review and puts the family in a new car.",
      "Progress is measured by net worth, because that's exactly what the R2m is meant to do. It leads the Savings screen.",
    ],
  },
  {
    heading: "The privacy eye",
    paragraphs: [
      "Tap the eye to mask every rand figure to “R ••••” — for glancing at the app in a queue or on a call. Percentages stay, so the shape is there without the substance.",
      "Revealing again needs your app password.",
    ],
  },
  {
    heading: "Your tabs and the Menu",
    paragraphs: [
      "Home and Menu are fixed on the bottom bar. The three tabs in between are yours to choose in Settings → Navigation, per device.",
      "Everything not on the bar is one tap away under Menu.",
    ],
  },
  {
    heading: "Kids' accounts (Lisa & Liam)",
    paragraphs: [
      "Tracked per child and kept deliberately out of your own net worth, so money locked away for them never looks reachable.",
      "A transfer can land straight in a child's account without passing through yours.",
    ],
  },
];

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-07-25",
    title: "Daily brief on Home",
    points: [
      "A once-a-day Coach-voice card at the top of Home — what's spendable, your pace, crypto's move, days to payday.",
      "Settings → Daily brief to choose the voice (Coach / Analyst / Gentle) and which sections it covers.",
      "Built once each morning and cached, so it costs about one small AI call a day.",
    ],
  },
  {
    date: "2026-07-25",
    title: "“Log a buy” for crypto",
    points: [
      "Record a purchase as an event — coins in, cash out of the paying account, dated — instead of hand-editing a total.",
      "It adds to your existing position and shows where the money came from.",
    ],
  },
  {
    date: "2026-07-25",
    title: "“More” became “Menu”",
    points: ["The bottom-bar overflow tab and its screen now read Menu."],
  },
  {
    date: "2026-07-24",
    title: "Savings, net worth and budgets",
    points: [
      "Savings pots tagged by where they live (Capitec / GOtyme).",
      "Net worth gained a grouped, one-page layout with a liabilities list.",
      "“Putting away” budget lines, so a monthly crypto contribution can be part of the budget.",
    ],
  },
  {
    date: "2026-07-22",
    title: "The fresh-start release",
    points: [
      "Payday reset that keeps your balances and hides old history without deleting it.",
      "Stats screen (income beside spend), category manager, the privacy eye, configurable tabs, and category icons.",
      "Savings replaced the old Goals screen.",
    ],
  },
  {
    date: "2026-07-21",
    title: "Crypto module and the move to Postgres",
    points: [
      "Live portfolio, holdings by wallet, Core 5, the milestone engine, movers and charts.",
      "The app moved onto Neon Postgres, read through its own secure API.",
    ],
  },
];

export const UNDER_HOOD: GuideBlock[] = [
  {
    heading: "Your data is private and server-side",
    paragraphs: [
      "Everything lives in a private Postgres database and is read through the app's own API. The browser never talks to your bank or the price feed directly — that's exactly the failure (client-side API calls) that broke earlier prototypes, fixed here by design.",
    ],
  },
  {
    heading: "Net worth is worked out, not stored",
    paragraphs: [
      "It's derived fresh every time from accounts, investments, live crypto and debts, so there's never a stale total sitting next to a fresh one.",
    ],
  },
  {
    heading: "Delete means archive",
    paragraphs: [
      "Things you remove are hidden, not destroyed, so they can come back. True deletion is deliberately slow and tucked away in Settings — an undo window is both faster and safer than a confirmation dialog you'd click through.",
    ],
  },
  {
    heading: "The app does the maths; the AI only phrases",
    paragraphs: [
      "The daily brief's figures are all computed by the app. The assistant only writes the sentence around them, so a number can't be invented — and it runs once a day, cached, to stay cheap.",
    ],
  },
  {
    heading: "Prices are cached",
    paragraphs: [
      "Crypto prices come from CoinGecko, refreshed roughly every minute on the server. That keeps the app fast and well clear of rate limits, and the browser never calls CoinGecko itself.",
    ],
  },
  {
    heading: "Careful with dates and money",
    paragraphs: [
      "Every date is handled in South African time, so a payment never slips to the day before (the server runs in UTC; you're two hours ahead — a real trap the app guards against).",
      "Money always reads en-ZA — R1 234,00 — with lined-up figures so columns don't jump as prices tick.",
    ],
  },
  {
    heading: "Every change is recorded, and shows everywhere at once",
    paragraphs: [
      "An audit trail means a wrong edit can be traced and put back exactly. And a change on one screen appears immediately on the others — you never see a fresh figure beside a stale one.",
    ],
  },
];
