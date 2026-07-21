@AGENTS.md

# PWOS — Personal Wealth Operating System
### Build spec · single source of truth for Claude Code · v1

> Read this whole file before writing any code. Everything here is a locked decision.
> Build V1 scope only. Quality, clean architecture and a world-class crypto module over feature quantity.

## 0 · What we're building
A private, single-user wealth operating system — a real, fully mobile-responsive web app (not a dashboard, not a static prototype), usable on desktop and phone from one URL, and installable as a PWA so it lives on the phone home screen with its own icon and full-screen chrome — it should feel like a real app.

Hero: R2,000,000 by February 2028 — the "freedom number". It clears the ~R975k home loan, wipes the debt review + smaller debts (~R1.16M all-in), and puts the family in a new car. This number, its progress %, and what it unlocks is the centrepiece of Home — with true net worth shown honestly beneath it.

Deploy target: Vercel, project pwos-mrleng (URL pwos-mrleng.vercel.app; custom domain later).

Locale: South Africa. ZAR primary (crypto USD-native, converted). Timezone Africa/Johannesburg. Payday = 24th monthly.

## 1 · Stack (locked)
- Next.js (App Router) + TypeScript + React, deployed on Vercel.
- Tailwind CSS with the Concept B tokens (§6).
- Server layer = Next.js route handlers / server actions. The only place secrets and external API calls live.
- Data backend = existing Airtable base appL4V6tbsGRJ7WxQ via Airtable REST API, server-side only. Reused, not migrated.
- Live crypto prices = best-coverage provider of Claude Code's choosing. CoinGecko is the proven default because it covers all ~67 held coins (incl. small caps/dust) and returns ZAR natively; substitute only if coverage across the actual Holdings symbols is clearly better. Whatever the provider: server-side + cached.
- Auth = single-user private gate (signed session cookie or NextAuth credentials/passkey). No public signup, no multi-user.
- Client data: server components by default; SWR/React Query for live crypto views, polling our own cached endpoints (never CoinGecko/Airtable directly).
- Charts: Recharts or visx, dark-first. PWA: installable, responsive, mobile-first.

## 2 · Security rules (non-negotiable)
1. AIRTABLE_TOKEN, price API key, AUTH_SECRET, app password = server-side env vars only. Never in a client component, never NEXT_PUBLIC_*, never shipped to the browser.
2. All Airtable and price-provider calls go through server route handlers / server actions. The browser talks only to our own API.
3. Auth-gate every route.
4. This is the exact failure that broke previous prototypes (client-side API calls + CORS). Fix it structurally.
5. Git branch, commit often. Ask before any destructive Airtable write.

## 3 · Airtable data contract
Base appL4V6tbsGRJ7WxQ. Build a typed server-side Airtable client. At build time, call the Airtable Metadata API to fetch the live schema and confirm every field id before writing — ids below are known-good anchors, not the full set.

Tables:
- Net Worth  tblYdUqI6nZ12tC3N  — accounts + assets/liabilities ledger
- Holdings   tbl7OpIaEv33NJLi6  — crypto positions (qty, cost, milestones, wallet)
- Transactions tblTjpHJr5ZtRTJ7i — cash + crypto ops ledger
- Budget     tblSufyNfR65shnBt
- Finance Live State tblMQL5IY55TIVu2W — single-row live budget/cycle
- Savings Goals tblTXNkBx8K7nfIhl
- Debt Tracker tblST3fTejbm3yAsB
- Kids Accounts tbliHyrFGyWNaamF0 — Lisa & Liam
- Market Data tblMDxJG8FyYZuYtH
- Daily Crypto Report tblOnIdrw4iv2Mfun
- Snapshots  tblLh1ZFJF3U7ekOi — portfolio value history

Known field anchors:
- Net Worth: name fldfxiUQZvJxyTu0f · value ZAR fldqBv7liYBBOQ3Lz · category fldBS5N3nnYVMCQ3q · asset/liability fldGCrLxFR8XIwxZB · last updated fld13UXcF9zmMxxXw
- Holdings: symbol fldL9NuokO2cANhAV · qty fldFTp6MuMerf8vnn · price ZAR fld5bv5V8vtj3ahQ9 · value ZAR fldtxDMMWr8Dx5Y5W · invested ZAR fldt9tKeDy3YGtHkg · wallet fldpH542CYdy56BZp · M1–M5 in fld4U4jh59SsEne85 / fldHIGHprVYvejSvC / fld7oVYZ3SpV5Bw9P / fldNJ5K4VtW8uWEHZ / fld5SNCiJPQPOP8E8 (freeform text — parse robustly)
- Transactions: description fldkv75saQVcniLIk · amount fldrJ6f3gt0PwbJgC · category fldhsDTulqpR7MdtA · account fldsoRG39bewZ2MWC · date fldT6wzkOhs44yJ1x · notes fldvh7XMPP3aQtyV3
- Debt Tracker: name fld19zodyvt0yKC1P · balance fldyDq6KrUTl0MQgt · monthly fldRylhwh9GUkXciS · priority fld9HFlI1tDIedwBJ · status fldxbXjuQeD4F9xpH · payoff date fldpRkJrHVVd21Vf4

Data-model fixes (do NOT copy the current mess):
- Debt de-duplication: the debt review appears twice — Anders (~R160,345) and MBD Legal (~R160,745) are almost certainly one debt entered twice. Debt Tracker is the single source; Net Worth debt is a derived rollup, not a second truth. Flag the Anders/MBD duplicate in the UI for the user to confirm/merge — do not silently delete.
- Transaction types = income | expense | transfer | contribution. Transfers and contributions must NEVER count as budget "spend". Budgets reflect real expenses only.
- Currency: every value carries an explicit currency. ZAR display-primary; crypto native USD, converted. Never mix silently.
- Net Worth is derived: compute live from accounts + investments + live crypto + liabilities. Don't hand-maintain a separate total.

## 4 · Entities
- Personal — Romano.
- Business — CreativeDigital (accounts incl. Capitec Business, income/expenses tagged to it). Basic profile V1.
- Family — Lisa & Liam (children; Kids Accounts), Janeese (partner).
- Consolidated view = personal + business + family, with a per-entity filter.
- Natroceutics excluded (separate client system).

## 5 · Modules
Ships in V1: Home · Wealth Overview · Banking/Accounts · Transactions · Budgets · Goals · Crypto (flagship) · Investments (summary) · Liabilities/Debt · Net Worth · Businesses · Reports (basic) · Settings. Plus dark+light, responsive/PWA, secure login.

Deferred to V1.1+ (architect for, don't build): document vault · statement upload (PDF/CSV) · Credit Cards · Bills & Subscriptions · Assets register · Tax Centre · AI Wealth Advisor · live bank/broker/exchange integrations.

### Home
Hero freedom number (progress %, amount to go, Feb-2028 target, what it unlocks). True net worth beneath. At-a-glance strip: total wealth · crypto value + 24h · cash on hand · budget cycle (payday 24th) · next milestone · top movers.

### ★ Crypto — the flagship. World-class, live, fast. Watched daily.
Live data:
- Prices from the chosen provider server-side, ZAR + USD, auto-refreshing. Client polls our cached endpoint (~60s via SWR); server caches upstream ~30–60s for rate limits. Show a subtle "live · updated Xs ago" indicator.
- Aliases: RENDER -> CoinGecko RNDR; POL -> polygon-ecosystem-token. Coins with no provider id (ECNMG, MISC) fall back to stored Airtable value.
Views:
- Portfolio overview: total value, invested, unrealised P&L (R and %), R2M freedom progress %, 24h change.
- Holdings by wallet: EasyCrypto · Tangem (Forever Bag / Growth Engine / Trading) · Luno. Per coin: qty, live price, value, cost basis, P&L (R and %), weight %.
- Core 5 tracker: BTC, ETH, XRP, HBAR, ENA — only coins getting fresh monthly capital (DCA on the 24th).
- Milestone engine M1–M5: per coin, live price vs each trigger, distance to next, exact sell/keep instruction (rand amount, coin count, coins to keep). M4 = peak/euphoria sell (largest); M5 = hard Feb-2028 full exit, no exceptions; no breakeven sells. Parse existing milestone text from Holdings; surface a clear MILESTONE HIT state when crossed.
- Movers: 24h top gainers / losers.
- Charts: per-coin price + portfolio value over time (Snapshots history + live point), dark-first.
Sync model:
- Holdings = source of truth for positions (qty, cost basis, wallet, milestone plans).
- Live prices overlay from the provider; server recomputes value / P&L / milestone distances on every load — never trust the stale Airtable price for display, only fallback.
- Write-back: daily portfolio snapshot to Snapshots / Daily Crypto Report (button + optional Vercel cron).
- Logging a buy writes to Holdings and recalculates that coin's milestones immediately.

### Other V1 modules
- Wealth Overview — consolidated wealth by class & entity; assets vs liabilities; trend.
- Banking/Accounts — cash accounts (Capitec Main, Capitec Business, GOtyme, ABSA, Capitec Savings) with live balances.
- Transactions — typed. expense: create txn + deduct account. transfer: move between accounts + one txn. contribution: deduct source + credit goal/investment + one txn. Every entry confirms its paired balance update.
- Budgets — cycle 24th to 24th; real expenses only; category spend; safe-to-spend / runway (spendable = Capitec Main + GOtyme; Business excluded).
- Goals — freedom goal + savings goals + coin-accumulation goals.
- Investments (summary) — RA, TFSA, Equities, EasyProperties, Family Future as summary balances (expandable later).
- Liabilities/Debt — de-duplicated; payoff priorities, balances, monthly, payoff dates.
- Net Worth — derived, honest, with history.
- Businesses — CreativeDigital basic profile.
- Reports — basic monthly summary.
- Settings — dark/light, locale, preferences.

## 6 · Design system — Concept B "Modern Financial Workspace"
Dark-first (light toggle). Premium, restrained — Linear / Mercury / Vercel calibre. Never looks AI-generated: no gratuitous gradients, purposeful motion only, generous whitespace, hairline dividers, tabular figures for money.

Tokens:
--bg:#0a0a0b  --surface:#141416  --surface-2:#18181b  --raise:#1d1d21
--line:#232327  --line-2:#2c2c31
--ink:#ededef  --muted:#9a9aa2  --faint:#66666e
--accent:#8a86f5   (restrained indigo)
--gain:#5fb98a  --loss:#cf7a68  --warn:#d4a24a  --info:#6f9bd1
font: Inter; money uses tabular-nums

Layout: bottom-tab nav on mobile, sidebar on desktop. Mobile-first, PWA-installable. Money formatted en-ZA (R, thousands separators).

## 7 · Conventions
- ZAR primary; crypto USD-native converted.
- en-ZA, Africa/Johannesburg, payday 24th.
- No breakeven crypto sells; milestone discipline is sacred.
- Don't hardcode financial data — read live from Airtable + the price provider.

## 8 · Suggested build order
1. Scaffold Next.js + TS + Tailwind + PWA; Concept B tokens + app shell (nav, dark/light, auth gate).
2. Env config + single-user auth.
3. Server clients: typed Airtable client (with Metadata-API schema fetch) + cached price client. All server-side.
4. Crypto module first — live portfolio, holdings by wallet, Core 5, milestone engine, movers, charts, snapshot write-back.
5. Home dashboard (freedom number + at-a-glance).
6. Accounts -> Transactions (typed + balance updates) -> Budgets -> Goals.
7. Debt (deduped) -> Net Worth (derived) -> Investments (summary) -> Businesses -> Reports -> Settings.
8. Polish: responsive/PWA, loading/error/empty states, accessibility.

## 9 · Environment variables (Romano sets these — never commit)
AIRTABLE_TOKEN=            # scoped PAT for base appL4V6tbsGRJ7WxQ, server-side only
AIRTABLE_BASE_ID=appL4V6tbsGRJ7WxQ
PRICE_API_KEY=             # optional; only if the chosen provider needs one (public tiers work for V1)
AUTH_SECRET=               # random 32+ char secret
APP_PASSWORD=              # single-user gate (or passkey config)
# None of these may be NEXT_PUBLIC_*

## 9b · User experience — interactive, not a report (locked 2026-07-21)
PWOS is a financial **operating system**, not a reporting dashboard. Every major card supports the
actions that make sense for it: view · add · edit · delete · import · export · search · filter ·
drill down · view history. Workflows beat static reporting. It should feel like a premium
productivity tool — fast, intuitive, and changes reflected everywhere immediately.

Interaction rules:
- **Undo, not confirm.** Destructive actions apply optimistically with an ~8s undo toast. Confirmation
  dialogs train the user to click through without reading; an undo window is both faster and safer.
  The exception is a *hard* delete (below), which is deliberately slow.
- **Delete means archive.** Set `Status` → Archived where the table has the field (Holdings, Debt
  Tracker, Savings Goals all do). The row leaves the app but survives in Airtable indefinitely.
  True deletion lives only in Settings behind a typed confirmation, and still asks Romano (§2.5).
- **Slide-overs, not modals**, for add/edit — context stays visible behind the panel.
- **Inline edit** for single values. **⌘K command palette** for everything else.
- **The browser never composes a write.** Every mutation is a validated server action that recomputes
  from source; a client-supplied payload is never trusted (see `commitSnapshot`).
- **Read-your-writes.** Use Next 16's `updateTag` so a change made on Crypto is immediately reflected
  on Home, Net Worth and Wealth — never a stale figure beside a fresh one.
- **Airtable has no transactions.** Any multi-write operation (transfer, contribution) must be ordered
  so a partial failure is detectable and repairable, and must surface the inconsistency rather than
  hide it.

Build order for this: prove the whole pattern on **Crypto** first — it's live, it's opened daily, and
it's the honest test of whether the interaction model works. Only then roll it across the other modules.

## 10 · Guardrails
- Do NOT reuse, port, or take layout/styling cues from any existing HTML artifacts or prototypes — they were static mobile-viewer hacks. Build the UI fresh from the Concept B design system (§6). Reference old files for data logic only, never for structure or look.
- Git branch + frequent commits; never fully autonomous against live data without a checkpoint.
- Confirm before destructive Airtable writes.
- Stay in V1 scope. If tempted beyond it, note it as a V1.1 candidate and move on.

---

## 11 · Verified build notes (added during scaffold, 2026-07-21)
- Stack as built: **Next.js 16.2.11**, React 19.2.4, Tailwind v4, `src/` dir, `@/*` alias, Turbopack.
  Next 16 differs from older App Router docs — consult `node_modules/next/dist/docs/` before using an API from memory.
- Repo: PWOS is its **own** git repo (not part of the parent `Claude/Projects` repo, which is excluded via `.git/info/exclude`).
- Airtable schema **verified live** against base appL4V6tbsGRJ7WxQ. All §3 field-id anchors are correct. Additional facts:
  - `Market Data` has **`CoinGecko ID` (fldrYwKFTItHLIaAF)** — resolve coin→provider id from this, don't hardcode aliases.
  - `Holdings` also has: Coin (primary, fldo3Eg3vBtWlixRX), Avg Buy Price fldKa4sOkDpaS5F29, Return % fldoGnlgLLcgOYHt4,
    Unrealised P&L fldaRSeSZjtaLxelQ, Weight % fld9qF4zqfYfCcY87, Status fld4Za8pm5p82Pm50,
    Holding Category fldwAAwKWdBSAx30j, Target Price R250k/R2M/R3M, Breakeven Action Plan fldmTWySGaK0Eyan1.
    M1–M5 are `multilineText` → parse tolerantly, always keep raw text as fallback.
  - `Snapshots` is **USD-denominated** (Total Portfolio Value (USD) flduj9mEMUNjhwcXf) and `Snapshot Date` is
    **singleLineText, not a date field**. `Daily Crypto Report` is ZAR. Handle both; parse dates defensively.
  - `Transactions` has **no type field** (income|expense|transfer|contribution) — §3 requires one.
    Adding it is an additive schema change → **ask Romano before writing**. `temp_do_not_use` fldxxu9rYZGo2RcQ2 is junk.

### Data findings from building the Crypto module (2026-07-21)
- **Holdings has 48 rows**, not 67 coins — several coins appear in more than one wallet.
- **Wallets in the data:** EasyCrypto · Luno · Tangem — Forever Bag · Tangem — Growth Engine ·
  Tangem — Trading · **Tangem — Cold Wallet** (this last one is NOT in §5's list). Wallet ordering
  must stay tolerant: unknown wallets sort last but are never dropped.
- **Milestone text uses US number conventions** — `R1,268` is one thousand two hundred sixty-eight,
  `R181.20` has a decimal point. Display is en-ZA (`R1 268,00`). Parsing these with en-ZA rules
  misreads every trigger by three orders of magnitude. Pinned by a test.
- Milestone shapes seen: `Price: R… | Sell R… (N coins) | Keep N`, approximations (`~2,143 coins`,
  `Keep ~2.998M`), prose sells (`Sell tiny fraction…`, `Keep most`), bracketed notes whose contents
  must not be mistaken for triggers, and several `n/a` variants. M5 is date/conviction based.
- **Snapshots (tblLh1ZFJF3U7ekOi) is effectively abandoned** — 1 row, all value columns empty, and
  its notes describe cash transactions. Do NOT read charts from it.
- **Daily Crypto Report (tblOnIdrw4iv2Mfun) is the real history** — 34 rows, ZAR, ISO date strings.
  The retired 3-hourly scheduler wrote up to **9 rows for a single date** (2026-06-21), so any series
  must collapse to one point per day (last write wins) or it draws a sawtooth that never happened.
- History stops ~2026-06-24; the scheduler is retired (see the Finance Live State description).
- **Timezone trap:** `new Date("14 Jun 2026").toISOString()` yields the 13th, because the string parses
  as local midnight in SAST (UTC+2). Vercel runs in UTC and Romano is UTC+2, so always format dates
  through `toLocalISODate()` in `src/lib/crypto/history.ts`. Pinned by regression tests.
- Portfolio is currently **down**: roughly R254k invested against ~R138k value as of the last stored
  snapshot. Freedom progress ≈ 6.9%. The UI must not soften this.
