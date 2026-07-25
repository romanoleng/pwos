/**
 * Durable login throttle (Romano's ask, 2026-07-26, after going public on a
 * custom domain).
 *
 * The old throttle was an in-memory Map. On Vercel's serverless runtime every
 * cold start is a fresh process, so that counter reset constantly and the
 * lockout never really held — which quietly pushed ALL the security onto
 * password strength. This persists the state in Postgres so a brute-force is
 * actually slowed, cold start or not.
 *
 * Policy: up to MAX_ATTEMPTS wrong passwords in a rolling WINDOW, then a lock
 * whose length DOUBLES each time it trips (1, 2, 4 … capped at an hour). The
 * escalation only resets on a successful login, so a sustained attack faces
 * ever-longer locks while an honest mistype clears itself.
 *
 * Single-user app, so the throttle is global (one row). The trade-off: a
 * determined attacker hammering the box can also lock Romano out for up to an
 * hour — accepted, because it self-heals when they stop, and blocking
 * brute-force matters more than never being briefly locked. Everything here
 * fails OPEN: if the database hiccups, a login is never blocked by the
 * throttle — only ever by the wrong password.
 */
import "server-only";

import { sql } from "./db";

// A wrong-password window of 15 minutes. Inlined as literal SQL below — it's a
// fixed constant we control, never user input, so it isn't a bound parameter.
const MAX_ATTEMPTS = 8;
const MAX_LOCK_SECONDS = 60 * 60; // an hour

let ensured = false;
async function ensureThrottle(): Promise<void> {
  if (ensured) return;
  await sql`
    create table if not exists login_throttle (
      id           boolean primary key default true check (id),
      attempts     int not null default 0,
      window_start timestamptz,
      lock_level   int not null default 0,
      locked_until timestamptz
    )`;
  await sql`insert into login_throttle (id) values (true) on conflict (id) do nothing`;
  ensured = true;
}

/** Whether login is currently locked, and for how many more seconds. */
export async function checkLoginLock(): Promise<{ locked: boolean; retryAfterSec: number }> {
  try {
    await ensureThrottle();
    const rows = await sql<{ secs: number | null }>`
      select ceil(extract(epoch from (locked_until - now())))::int as secs
      from login_throttle
      where id and locked_until is not null and locked_until > now()`;
    const secs = rows[0]?.secs ?? 0;
    return secs > 0 ? { locked: true, retryAfterSec: secs } : { locked: false, retryAfterSec: 0 };
  } catch (error) {
    console.error("[loginThrottle] check failed — failing open", error);
    return { locked: false, retryAfterSec: 0 };
  }
}

/**
 * Record a wrong password. Returns the lock length in seconds if this attempt
 * tripped a lock, otherwise null. Fails open (null) on any database error.
 */
export async function recordLoginFailure(): Promise<{ lockedSec: number | null }> {
  try {
    await ensureThrottle();
    // One atomic statement: start a fresh window if the last one has elapsed,
    // otherwise increment within it.
    const [row] = await sql<{ attempts: number; lock_level: number }>`
      update login_throttle set
        window_start = case
          when window_start is null or now() - window_start > interval '15 minutes'
          then now() else window_start end,
        attempts = case
          when window_start is null or now() - window_start > interval '15 minutes'
          then 1 else attempts + 1 end
      where id
      returning attempts, lock_level`;

    if (!row || row.attempts < MAX_ATTEMPTS) return { lockedSec: null };

    const level = row.lock_level + 1;
    const lockedSec = Math.min(MAX_LOCK_SECONDS, 60 * 2 ** (level - 1));
    await sql`
      update login_throttle set
        lock_level   = ${level},
        locked_until = now() + (${lockedSec} * interval '1 second'),
        attempts     = 0,
        window_start = now()
      where id`;
    return { lockedSec };
  } catch (error) {
    console.error("[loginThrottle] record failed — failing open", error);
    return { lockedSec: null };
  }
}

/** Clear the throttle after a successful login. */
export async function clearLoginFailures(): Promise<void> {
  try {
    await ensureThrottle();
    await sql`
      update login_throttle set attempts = 0, lock_level = 0, locked_until = null, window_start = null
      where id`;
  } catch (error) {
    console.error("[loginThrottle] clear failed", error);
  }
}

/** "3 minutes" / "45 seconds" for a user-facing wait time. */
export function formatWait(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.ceil(seconds / 60);
    return `${mins} minute${mins === 1 ? "" : "s"}`;
  }
  const secs = Math.max(1, Math.ceil(seconds));
  return `${secs} second${secs === 1 ? "" : "s"}`;
}
