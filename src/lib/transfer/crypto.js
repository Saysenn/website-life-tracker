import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

let cachedKey;

function key() {
  if (cachedKey) return cachedKey;
  const secret = process.env.TRANSFER_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set TRANSFER_SECRET or AUTH_SECRET to use file transfer");
  cachedKey = Buffer.from(hkdfSync("sha256", secret, "life-tracker", "file-transfer-v1", 32));
  return cachedKey;
}

/** AES-256-GCM. Output is iv (12) + tag (16) + ciphertext. */
export function seal(data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function unseal(data) {
  const buffer = Buffer.from(data);
  const decipher = createDecipheriv("aes-256-gcm", key(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]);
}

export const sealText = (text) => seal(Buffer.from(text, "utf8")).toString("base64");

export function unsealText(value) {
  try {
    return unseal(Buffer.from(value, "base64")).toString("utf8");
  } catch {
    return null;
  }
}

export const randomId = (bytes = 16) => randomBytes(bytes).toString("base64url");

export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");

export function sameText(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  return left.length === right.length && timingSafeEqual(left, right);
}
