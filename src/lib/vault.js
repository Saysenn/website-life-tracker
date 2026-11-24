import "server-only";
import { decryptText, encryptText, isEncrypted, openLegacySealed } from "@/db/cipher";

/**
 * Passwords are sealed by the app and only opened on an explicit reveal, so they
 * never reach a page unless asked for. Same keys as the rest of the database.
 */
export function seal(value) {
  const text = (value ?? "").trim();
  return text ? encryptText(text) : null;
}

export function unseal(value) {
  if (!value) return "";
  try {
    if (isEncrypted(value)) return decryptText(value);
    const legacy = openLegacySealed(value);
    if (legacy !== undefined) return legacy;
  } catch (error) {
    console.error("Could not open a saved password", error.message);
  }
  return "";
}
