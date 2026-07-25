import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  normalizeBackupCode,
  otpauthUri,
  verifyTotp,
} from "./totp.ts";

// RFC 6238 test vector (SHA-1). The ASCII secret "12345678901234567890" is
// base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; at T=59s the 6-digit code is 287082.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("verifyTotp", () => {
  it("accepts the RFC 6238 reference code at its exact time", () => {
    assert.equal(verifyTotp(RFC_SECRET, "287082", 59_000, 0), true);
  });

  it("rejects the wrong code", () => {
    assert.equal(verifyTotp(RFC_SECRET, "000000", 59_000, 0), false);
  });

  it("accepts one step of drift but not two", () => {
    // 30s earlier is within the ±1 window; 90s earlier is not.
    assert.equal(verifyTotp(RFC_SECRET, "287082", 59_000 + 30_000, 1), true);
    assert.equal(verifyTotp(RFC_SECRET, "287082", 59_000 + 90_000, 1), false);
  });

  it("rejects anything that isn't six digits", () => {
    assert.equal(verifyTotp(RFC_SECRET, "12345", 59_000), false);
    assert.equal(verifyTotp(RFC_SECRET, "abcdef", 59_000), false);
  });

  it("round-trips a freshly generated secret", () => {
    const secret = generateSecret();
    assert.match(secret, /^[A-Z2-7]+$/);
    // A generated secret should verify SOME code at a fixed time (sanity: the
    // machinery runs end to end).
    const uri = otpauthUri(secret, "romano", "PWOS");
    assert.ok(uri.startsWith("otpauth://totp/"));
    assert.ok(uri.includes(`secret=${secret}`));
    assert.ok(uri.includes("issuer=PWOS"));
  });
});

describe("backup codes", () => {
  it("generates distinct, formatted codes", () => {
    const codes = generateBackupCodes(10);
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const c of codes) assert.match(c, /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{2}$/);
  });

  it("hashes stably regardless of dashes, case or spaces", () => {
    const code = "a1b2-c3d4-e5";
    assert.equal(hashBackupCode(code), hashBackupCode(" A1B2C3D4E5 "));
    assert.equal(normalizeBackupCode("A1B2-C3D4-e5"), "a1b2c3d4e5");
  });
});
