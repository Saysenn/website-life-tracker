/**
 * Encryption at rest for database values. AES-256-GCM, a fresh random IV per value.
 *
 * Stored form: "enc:1:" + base64url(iv | tag | ciphertext).
 *
 * Keys, newest first:
 *   DATA_ENCRYPTION_KEY           encrypts everything new when it is set (recommended)
 *   DATA_ENCRYPTION_KEY_PREVIOUS  read only, for rotating DATA_ENCRYPTION_KEY
 *   AUTH_SECRET                   the original vault key, so passwords saved before still open
 *
 * No "server-only" import: drizzle-kit and scripts/encrypt-data.js load this through the schema.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scryptSync } from "node:crypto";

export const PREFIX = "enc:1:";
const IV = 12;
const TAG = 16;

let ring;

const dataKey = (secret) => Buffer.from(hkdfSync("sha256", secret, "life-tracker", "data-encryption-v1", 32));
// Exactly what src/lib/vault.js always used, so older sealed passwords still decrypt.
const vaultKey = (secret) => scryptSync(secret, "life-tracker-vault", 32);

function keys() {
  if (ring) return ring;
  const primary = process.env.DATA_ENCRYPTION_KEY?.trim();
  const previous = process.env.DATA_ENCRYPTION_KEY_PREVIOUS?.trim();
  const auth = process.env.AUTH_SECRET;

  const list = [];
  if (primary) list.push(dataKey(primary));
  if (previous) list.push(dataKey(previous));
  if (auth) list.push(vaultKey(auth));
  if (!list.length) throw new Error("Set DATA_ENCRYPTION_KEY or AUTH_SECRET: they encrypt the database.");
  ring = { write: list[0], read: list, legacy: auth ? vaultKey(auth) : null };
  return ring;
}

/** The key new values are written with is not the one this value was written with. */
export function needsRekey(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return false;
  return open(value, [keys().write]) === undefined;
}

function open(value, candidates) {
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  if (raw.length < IV + TAG) return undefined;
  for (const key of candidates) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV));
      decipher.setAuthTag(raw.subarray(IV, IV + TAG));
      return Buffer.concat([decipher.update(raw.subarray(IV + TAG)), decipher.final()]).toString("utf8");
    } catch {
      // wrong key, try the next one
    }
  }
  return undefined;
}

export const isEncrypted = (value) => typeof value === "string" && value.startsWith(PREFIX);

/** Encrypts a string. null, undefined and "" pass through, and an already encrypted value is left alone. */
export function encryptText(value) {
  if (value === null || value === undefined || value === "") return value;
  const text = String(value);
  if (isEncrypted(text)) return text;
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", keys().write, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/**
 * Decrypts a value written by encryptText. Plain text (rows saved before encryption
 * was switched on) comes back unchanged. A value no key opens throws rather than
 * showing an empty field that could then be saved over the real data.
 */
export function decryptText(value) {
  if (!isEncrypted(value)) return value;
  const text = open(value, keys().read);
  if (text === undefined) throw new Error("A database value could not be decrypted. Check DATA_ENCRYPTION_KEY and AUTH_SECRET.");
  return text;
}

/* The format src/lib/vault.js used before: "iv.tag.body", base64url, keyed from AUTH_SECRET. */

export function openLegacySealed(value) {
  if (typeof value !== "string" || isEncrypted(value)) return undefined;
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  const [iv, tag, body] = parts.map((part) => Buffer.from(part, "base64url"));
  const candidates = [...keys().read, ...(keys().legacy ? [] : [vaultKey("life tracker")])];
  for (const key of candidates) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch {
      // wrong key, try the next one
    }
  }
  return undefined;
}

/** Only for scripts/encrypt-data.js --decrypt, which puts the database back the way the old code read it. */
export function sealLegacy(text) {
  const key = keys().legacy;
  if (!key) throw new Error("AUTH_SECRET is needed to write passwords in the old format.");
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}
