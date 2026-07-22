# Deploying PWOS to Vercel

## 1 · Create an empty private GitHub repo

<https://github.com/new>

- **Name:** `pwos`
- **Visibility:** **Private** — this app reads your finances. Never public.
- Do **not** tick "Add a README", ".gitignore" or "license". The repo must be
  empty or the push below will conflict.

Copy the URL it shows you (`https://github.com/<you>/pwos.git`).

## 2 · Push (I can run this once you give me the URL)

```bash
cd ~/Claude/Projects/pwos
git remote add origin https://github.com/<you>/pwos.git
git push -u origin main
```

If git asks for a password, use a **Personal Access Token**, not your account
password — GitHub stopped accepting passwords in 2021.
Create one at <https://github.com/settings/tokens> with the `repo` scope.

## 3 · Connect Vercel

<https://vercel.com/new> → **Import Git Repository** → pick `pwos`.

- **Project name:** `pwos-mrleng` → gives you `pwos-mrleng.vercel.app`
- **Framework:** Next.js (detected automatically)
- **Build settings:** leave every default alone

## 4 · Environment variables — before you click Deploy

Add these under **Environment Variables**, for **all** environments
(Production, Preview, Development):

| Name | Value |
| --- | --- |
| `AIRTABLE_TOKEN` | your Airtable PAT (the same 82-character one) |
| `AIRTABLE_BASE_ID` | `appL4V6tbsGRJ7WxQ` |
| `AUTH_SECRET` | the value from your local `.env.local` |
| `APP_PASSWORD` | the value from your local `.env.local` |

`PRICE_API_KEY` is optional — leave it out unless you hit CoinGecko rate limits.

**None of these may be prefixed `NEXT_PUBLIC_`.** The app throws at boot if any
are, because that prefix ships a value to the browser.

Copy them from your local file with:

```bash
cd ~/Claude/Projects/pwos && cat .env.local
```

## 5 · Deploy

Click **Deploy**. First build takes about two minutes.

## 6 · Install it on your phone

Open `https://pwos-mrleng.vercel.app` in Safari → **Share** → **Add to Home
Screen**. It launches full-screen with its own icon, no browser chrome.

## After this

Every `git push` to `main` deploys automatically. Branches get their own
preview URL, so you can check a change before it reaches the live app.

### Still to do
- **Daily snapshot via Vercel Cron.** The snapshot button works; a cron would
  run it unattended. It needs a secured endpoint first — a cron URL that writes
  to Airtable must not be callable by anyone who guesses it.
- **Custom domain.** Vercel → Settings → Domains, once you have one.

---

# Backups

Your financial data lives in Airtable. This keeps a versioned copy in git.

```bash
npm run backup
git add backups && git commit -m "backup: $(date +%F)" && git push
```

**What it writes**

- `backups/latest/` — one file per table, overwritten each run. Diffs cleanly,
  so a commit shows exactly which records changed.
- `backups/snapshots/YYYY-MM-DD.json` — one immutable file per run. ~390 KB, so
  keeping every one indefinitely costs nothing.

Field *definitions* are included alongside records. Without them the field-id
keys would be unreadable if the Airtable schema were ever lost.

**How often:** weekly is plenty at ~64 transactions a month. Always run it
before any bulk edit in Airtable — that is the change most likely to need
undoing.

**Restoring:** the snapshot contains every record keyed by field id, plus the
schema. Recreating a table means POSTing those records back through the
Airtable API. Nothing about this is Airtable-specific, which is also what makes
a future migration off Airtable safe to attempt.
