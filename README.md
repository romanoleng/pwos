# PWOS — Personal Wealth Operating System

Private, single-user wealth app. Spec and source of truth: [CLAUDE.md](./CLAUDE.md).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Airtable · CoinGecko · Vercel

## Local setup

```bash
cp .env.example .env.local   # then fill AIRTABLE_TOKEN and APP_PASSWORD
npm install
npm run dev                  # http://localhost:3000
```

`AUTH_SECRET` is pre-generated in `.env.local`. Generate a new one with
`openssl rand -base64 32`.

## Security model

Secrets are read only through `src/lib/server/env.ts`, which imports
`server-only` — any client component that pulls it in, directly or
transitively, fails the build rather than leaking a token at runtime.
All Airtable and price-provider traffic goes through our own route handlers;
the browser never talks to either directly (CLAUDE.md §2).

`src/proxy.ts` gates every route by default. New pages are private
automatically; the allow-list in that file is the only way through.
