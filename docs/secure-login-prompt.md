# Secure login + 2FA — reusable build prompt

A portable, copy-paste prompt for reproducing PWOS's login security on any project.
Hand it to an AI builder (Claude, Cursor, v0, Lovable, …) or a developer. Fill in the one
stack line at the top; everything else is stack-agnostic.

Why this exists: the auth design below is the standard to reuse everywhere — password +
authenticator 2FA, brute-force lockout, one-time recovery codes, signed httpOnly sessions.
It's the same standard as online banking, and it's worth showing clients.

---

## The prompt

```text
Build a secure login screen with two-factor authentication (2FA).

TARGET STACK: <fill in — e.g. "Next.js + TypeScript + Postgres", "React + Node/Express",
"Laravel", "Django". If unspecified, use Next.js App Router + TypeScript.>

Match this exact security design — it's the standard I want on every project:

1) PASSWORD LOGIN
   - A clean, single login page: password field, clear error states, a "Checking…" state.
   - The password/secret lives ONLY server-side (env var or hashed in DB) — never in the
     browser, never in a client bundle, never a NEXT_PUBLIC/VITE_PUBLIC var.
   - Compare the password in CONSTANT TIME (e.g. crypto timingSafeEqual), or hash it with
     bcrypt/argon2 if multi-user. Never a plain `===`.

2) SESSION
   - On success, set a SIGNED, httpOnly, Secure, SameSite=Lax session cookie (a signed JWT
     or a server-side session). JavaScript must not be able to read it.
   - A default-DENY auth gate on EVERY page and API route: unauthenticated requests to pages
     redirect to /login; to APIs return 401. Nothing is reachable without a valid session.
   - Protect the post-login redirect against open-redirect (only allow same-origin paths).

3) BRUTE-FORCE PROTECTION (must survive serverless cold starts)
   - Persist failed-attempt state in the DATABASE, not in memory.
   - Policy: up to 8 wrong attempts in a rolling 15-minute window, then a lockout that
     DOUBLES each time it trips (1, 2, 4, 8… minutes, capped at 1 hour). The escalation
     resets only on a successful login.
   - Check the lock BEFORE verifying the password, so a locked attacker can't keep guessing.
   - A wrong 2FA code counts toward the same lockout as a wrong password.
   - FAIL OPEN: if the database is unreachable, never block a legitimate login on the
     throttle — only ever block on a wrong credential.

4) TWO-FACTOR (TOTP — authenticator app)
   - Standard TOTP (RFC 6238, SHA-1, 6 digits, 30s step), verified with ±1 step of drift.
     Implement it on the platform's crypto primitives (HMAC-SHA1) or a well-known library.
   - ENROLLMENT (in a Settings/Security screen): generate a 160-bit base32 secret, show a
     QR code (otpauth:// URI) AND the manual key, and REQUIRE a valid current code to turn
     2FA on — so a mis-set authenticator can never leave 2FA half-enabled.
   - LOGIN: when 2FA is on, the login page also asks for a 6-digit code; verify password
     THEN code before creating the session.
   - Store the TOTP secret so that rotating the SESSION-signing secret does NOT break 2FA
     (don't derive the TOTP encryption key from the session secret).

5) BACKUP / RECOVERY CODES
   - At enrollment, generate 10 one-time backup codes, show them ONCE, and store only their
     SHA-256 hashes. On login, accept a backup code as an alternative to the TOTP code and
     CONSUME it (delete that hash) so it can't be reused. Show how many remain.
   - Disabling 2FA requires a current code (TOTP or backup).

6) BIOMETRICS (Face ID / Touch ID)
   - On iOS/Android, the password and code fields should use autocomplete="current-password"
     / "one-time-code" so the OS keychain can autofill them with Face ID/Touch ID.
   - (Optional stretch: add a WebAuthn/passkey option as a true platform-biometric factor.)

7) PRIVACY / HYGIENE
   - Add noindex meta tags AND a robots.txt disallowing all crawlers, so a private app is
     never indexed.
   - No secrets or stack details ever leak to the client or into error messages.

DELIVERABLES: the login page, the auth gate/middleware, the session module, the DB-backed
rate limiter, the TOTP + backup-code logic, and a Settings screen to enrol/disable 2FA.
Include unit tests for the TOTP verifier against the RFC 6238 test vector (secret
"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" → code 287082 at T=59s) and for backup-code consume.
Explain the security rationale for each choice in comments.
```

---

## Adapting it

- **Multi-user client platform:** change the ask to *"multiple users, passwords hashed with
  argon2/bcrypt, per-user 2FA secret and backup codes."* The rest of the design is unchanged.
- **Correctness check you can show a client:** the RFC 6238 test vector in the prompt is a
  genuine pass/fail for the 2FA maths — if the build verifies `287082` at T=59s, its TOTP
  actually works.
- **The honest one-liner for clients:** "Logins are password + authenticator 2FA, with
  brute-force lockout, one-time recovery codes, and signed httpOnly sessions — the same
  standard as online banking."

## How PWOS implements each point (reference)

| Prompt point | Files in this repo |
|---|---|
| Constant-time password, signed cookie session | `src/lib/server/session.ts` |
| Default-deny auth gate | `src/proxy.ts` |
| DB-backed brute-force lockout | `src/lib/server/loginThrottle.ts` |
| TOTP + backup codes (RFC 6238) | `src/lib/server/totp.ts`, `src/lib/server/twofactor.ts` |
| Login with password + code | `src/app/actions/auth.ts`, `src/app/login/` |
| Enrol / disable 2FA in Settings | `src/components/settings/TwoFactorSettings.tsx` |
| noindex + robots | `src/app/layout.tsx` (metadata), `src/app/robots.ts` |
| TOTP unit tests vs RFC vector | `src/lib/server/totp.test.ts` |
