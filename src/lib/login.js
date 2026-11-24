import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";
import { verifyTotp } from "./totp";

const WINDOW_MS = 15 * 60 * 1000;
/** Failed sign ins one network gets per window. */
const MAX_FAILURES = 5;
/** Failed sign ins across every network per window, so many IPs cannot share the guessing. */
const MAX_GLOBAL_FAILURES = 30;

const digest = (value) => createHash("sha256").update(String(value)).digest();

function matches(username, password, expectedUser, expectedPassword) {
  if (!expectedUser || !expectedPassword) return false;
  if (typeof username !== "string" || typeof password !== "string") return false;
  const userOk = timingSafeEqual(digest(username.trim()), digest(expectedUser));
  const passwordOk = timingSafeEqual(digest(password), digest(expectedPassword));
  return userOk && passwordOk;
}

export const FILES_ROLE = "files";
export const FILES_HOME = "/tools/file-transfer";

const ACCOUNTS = [
  { role: "admin", user: "ADMIN_USERNAME", password: "ADMIN_PASSWORD", totp: "ADMIN_TOTP_SECRET" },
  { role: FILES_ROLE, user: "FILES_USERNAME", password: "FILES_PASSWORD", totp: "FILES_TOTP_SECRET" },
];

const totpSecret = (account) => process.env[account.totp]?.trim() || "";

/** Whether any account asks for an authenticator code, so the sign in forms show the field. */
export const twoFactorEnabled = () => ACCOUNTS.some((account) => totpSecret(account));

/**
 * "admin" for the full app, "files" for the file transfer only account, or null.
 * An account with a TOTP secret also needs the current authenticator code.
 */
export function verifyLogin(username, password, code) {
  for (const account of ACCOUNTS) {
    if (!matches(username, password, process.env[account.user], process.env[account.password])) continue;
    const secret = totpSecret(account);
    if (secret && !verifyTotp(secret, code)) return null;
    return account.role;
  }
  return null;
}

/** On Vercel x-forwarded-for is set by the platform, so the first entry is the real client. */
export function clientIp(headers) {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "local";
}

export async function isBlocked(ip) {
  const since = gt(loginAttempts.attemptedAt, Date.now() - WINDOW_MS);
  const [[mine], [everyone]] = await Promise.all([
    db.select({ failures: count() }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), since)),
    db.select({ failures: count() }).from(loginAttempts).where(since),
  ]);
  return mine.failures >= MAX_FAILURES || everyone.failures >= MAX_GLOBAL_FAILURES;
}

export async function recordFailure(ip) {
  console.warn(`Failed sign in from ${ip}`);
  await db.insert(loginAttempts).values({ ip, attemptedAt: Date.now() });
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, Date.now() - WINDOW_MS));
}

export async function clearFailures(ip) {
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
}
