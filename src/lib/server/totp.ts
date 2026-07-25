/**
 * TOTP (RFC 6238) + backup codes for two-factor login (Romano's ask,
 * 2026-07-26, on going public). Implemented on node:crypto — no dependency,
 * fully auditable, and the same primitive every authenticator app uses.
 *
 * The shared secret is a base32 string; a 6-digit code rotates every 30s. On
 * login we accept the current code ±1 step, so a little clock drift or a code
 * typed as it rolls over still works.
 *
 * Pure crypto helpers — no secrets, no DB — so this is not marked `server-only`
 * (which keeps it unit-testable); the modules that hold the secret are.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

/** A fresh 160-bit secret, base32-encoded (the strength authenticators expect). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

function equalStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** True if `token` is the current 6-digit code (±`window` steps of drift). */
export function verifyTotp(
  secretB32: string,
  token: string,
  nowMs: number = Date.now(),
  window = 1,
): boolean {
  const t = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  const secret = base32Decode(secretB32);
  if (secret.length === 0) return false;
  const step = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (let i = -window; i <= window; i += 1) {
    if (equalStr(hotp(secret, step + i), t)) return true;
  }
  return false;
}

/** The otpauth:// URI an authenticator app reads from the QR (or manual key). */
export function otpauthUri(secretB32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** One-time recovery codes, shown once, stored only as hashes. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(5).toString("hex"); // 40 bits, plenty behind the throttle
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8)}`;
  });
}

/** Normalise a typed backup code before hashing/compare (dashes, case, spaces). */
export function normalizeBackupCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}
