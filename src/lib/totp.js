import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** RFC 6238 time-based codes, as shown by Google Authenticator, 1Password, Authy and others. */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_MS = 30_000;
/** Accept the code before and after the current one, for clock drift. */
const DRIFT = 1;

function decodeBase32(secret) {
  const clean = String(secret).toUpperCase().replace(/[\s=-]/g, "");
  const out = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("A TOTP secret must be base32 (A-Z and 2-7).");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

function hotp(key, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", key).update(message).digest();
  const offset = hash[hash.length - 1] & 0xf;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret, code, now = Date.now()) {
  const given = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return false;
  const key = decodeBase32(secret);
  const counter = Math.floor(now / STEP_MS);
  let ok = false;
  for (let drift = -DRIFT; drift <= DRIFT; drift += 1) {
    ok = timingSafeEqual(Buffer.from(hotp(key, counter + drift)), Buffer.from(given)) || ok;
  }
  return ok;
}
