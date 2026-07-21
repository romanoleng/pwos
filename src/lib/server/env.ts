/**
 * Server-side environment access (CLAUDE.md §2, §9).
 *
 * `server-only` makes this a *build* error if any client component ever
 * imports it, directly or transitively. That is the structural fix for the
 * failure that broke the previous prototypes — it can no longer happen by
 * accident, it has to survive a compile.
 */
import "server-only";

/** Secrets that must never reach the browser under any name. */
const SECRET_KEYS = [
  "AIRTABLE_TOKEN",
  "PRICE_API_KEY",
  "AUTH_SECRET",
  "APP_PASSWORD",
] as const;

/**
 * Belt and braces for §2.1: if a secret ever gets re-exported as NEXT_PUBLIC_*,
 * fail loudly at boot rather than shipping it to the client bundle silently.
 */
for (const key of SECRET_KEYS) {
  if (process.env[`NEXT_PUBLIC_${key}`]) {
    throw new Error(
      `NEXT_PUBLIC_${key} is set. Secrets must never be exposed to the browser (CLAUDE.md §2). Remove it from your environment.`,
    );
  }
}

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function requireEnv(name: string): string {
  const value = read(name);
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}

export class MissingEnvError extends Error {
  constructor(readonly variable: string) {
    super(
      `Missing required environment variable ${variable}. Add it to .env.local (see .env.example) and restart the dev server.`,
    );
    this.name = "MissingEnvError";
  }
}

/**
 * Lazy getters, not a frozen object: a missing AIRTABLE_TOKEN should break the
 * Airtable call with a clear message, not take down the whole app at import
 * time (which would make the setup screen itself unreachable).
 */
export const env = {
  get airtableToken(): string {
    return requireEnv("AIRTABLE_TOKEN");
  },
  get airtableBaseId(): string {
    return read("AIRTABLE_BASE_ID") ?? "appL4V6tbsGRJ7WxQ";
  },
  get authSecret(): string {
    const secret = requireEnv("AUTH_SECRET");
    if (secret.length < 32) {
      throw new Error(
        "AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
      );
    }
    return secret;
  },
  get appPassword(): string {
    return requireEnv("APP_PASSWORD");
  },
  /** Optional — CoinGecko's public tier works for V1. */
  get priceApiKey(): string | undefined {
    return read("PRICE_API_KEY");
  },
};

export type ConfigStatus = {
  ready: boolean;
  missing: string[];
};

/** Drives the setup screen so a fresh clone explains itself instead of 500ing. */
export function getConfigStatus(): ConfigStatus {
  const missing: string[] = [];
  if (!read("AIRTABLE_TOKEN")) missing.push("AIRTABLE_TOKEN");
  if (!read("AUTH_SECRET")) missing.push("AUTH_SECRET");
  if (!read("APP_PASSWORD")) missing.push("APP_PASSWORD");
  return { ready: missing.length === 0, missing };
}

/** Auth alone can boot without Airtable — used by the proxy and login action. */
export function isAuthConfigured(): boolean {
  return Boolean(read("AUTH_SECRET") && read("APP_PASSWORD"));
}
