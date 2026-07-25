/**
 * Two-factor authentication — the server side (Romano's ask, 2026-07-26).
 *
 * TOTP (authenticator app) as a second factor after the password, with
 * one-time backup codes so a lost phone never means a lockout. State lives on
 * the single-row app_settings table:
 *   - totp_secret         the base32 shared secret (null until set up)
 *   - totp_enabled        whether the second factor is required at login
 *   - totp_backup_hashes  sha256 hashes of the recovery codes (never the codes)
 *
 * The secret is stored as-is rather than encrypted with AUTH_SECRET on purpose:
 * Romano was advised to rotate AUTH_SECRET, and coupling the two would turn a
 * secret rotation into a 2FA lockout. The database is private and access-gated;
 * the codes are the only thing that could unlock an account and those are
 * hashed.
 */
import "server-only";

import QRCode from "qrcode";

import { sql } from "./db";
import {
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  otpauthUri,
  verifyTotp,
} from "./totp";

const ISSUER = "PWOS";
const ACCOUNT = "romano";

let ensured = false;
async function ensureColumns(): Promise<void> {
  if (ensured) return;
  await sql`
    alter table app_settings
      add column if not exists totp_secret        text,
      add column if not exists totp_enabled        boolean not null default false,
      add column if not exists totp_backup_hashes  jsonb   not null default '[]'::jsonb`;
  ensured = true;
}

export async function twoFactorEnabled(): Promise<boolean> {
  try {
    await ensureColumns();
    const rows = await sql<{ totp_enabled: boolean }>`
      select totp_enabled from app_settings where id = true`;
    return rows[0]?.totp_enabled ?? false;
  } catch (error) {
    // Fail SAFE for a status read: if we can't tell, treat as OFF so a database
    // blip can't lock the owner out by demanding a code that was never set up.
    console.error("[twofactor] status read failed", error);
    return false;
  }
}

export type EnrollmentStart = {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
  backupCodes: string[];
};

/**
 * Begin setup: mint a secret and recovery codes, store them (still disabled),
 * and return everything the screen shows once. Enabling waits for a confirming
 * code, so a broken authenticator can never leave 2FA half-on.
 */
export async function beginEnrollment(): Promise<EnrollmentStart> {
  await ensureColumns();
  const secret = generateSecret();
  const backupCodes = generateBackupCodes(10);
  const hashes = backupCodes.map(hashBackupCode);

  await sql`
    update app_settings
      set totp_secret = ${secret},
          totp_enabled = false,
          totp_backup_hashes = ${JSON.stringify(hashes)}::jsonb
      where id = true`;

  const uri = otpauthUri(secret, ACCOUNT, ISSUER);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  return { secret, otpauthUri: uri, qrDataUrl, backupCodes };
}

/** Turn 2FA on, but only once a live code proves the authenticator is set up. */
export async function confirmEnrollment(code: string): Promise<boolean> {
  await ensureColumns();
  const rows = await sql<{ totp_secret: string | null }>`
    select totp_secret from app_settings where id = true`;
  const secret = rows[0]?.totp_secret;
  if (!secret || !verifyTotp(secret, code)) return false;
  await sql`update app_settings set totp_enabled = true where id = true`;
  return true;
}

/** Verify a login's second factor — a TOTP code, or a backup code (consumed). */
export async function verifySecondFactor(
  code: string,
): Promise<{ ok: boolean; viaBackup: boolean }> {
  await ensureColumns();
  const rows = await sql<{ totp_secret: string | null; totp_backup_hashes: string[] }>`
    select totp_secret, totp_backup_hashes from app_settings where id = true`;
  const row = rows[0];
  if (!row?.totp_secret) return { ok: false, viaBackup: false };

  const entered = code.trim();
  if (/^\d{6}$/.test(entered) && verifyTotp(row.totp_secret, entered)) {
    return { ok: true, viaBackup: false };
  }

  // Backup code: match by hash, then consume it so it can't be reused.
  const hashes = Array.isArray(row.totp_backup_hashes) ? row.totp_backup_hashes : [];
  const hash = hashBackupCode(entered);
  if (hashes.includes(hash)) {
    const remaining = hashes.filter((h) => h !== hash);
    await sql`
      update app_settings set totp_backup_hashes = ${JSON.stringify(remaining)}::jsonb
      where id = true`;
    return { ok: true, viaBackup: true };
  }

  return { ok: false, viaBackup: false };
}

/** Count of unused recovery codes — surfaced so a low balance is visible. */
export async function backupCodesRemaining(): Promise<number> {
  await ensureColumns();
  const rows = await sql<{ n: number }>`
    select jsonb_array_length(totp_backup_hashes) as n from app_settings where id = true`;
  return Number(rows[0]?.n ?? 0);
}

/** Turn 2FA off and forget the secret and codes. Requires a current code. */
export async function disableTwoFactor(code: string): Promise<boolean> {
  await ensureColumns();
  const { ok } = await verifySecondFactor(code);
  if (!ok) return false;
  await sql`
    update app_settings
      set totp_enabled = false, totp_secret = null, totp_backup_hashes = '[]'::jsonb
      where id = true`;
  return true;
}
