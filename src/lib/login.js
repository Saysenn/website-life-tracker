import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

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

/** "admin" for the full app, "files" for the file transfer only account, or null. */
export function verifyLogin(username, password) {
  if (matches(username, password, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD)) return "admin";
  if (matches(username, password, process.env.FILES_USERNAME, process.env.FILES_PASSWORD)) return FILES_ROLE;
  return null;
}

export function clientIp(headers) {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "local";
}

export async function isBlocked(ip) {
  const [row] = await db
    .select({ failures: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.attemptedAt, Date.now() - WINDOW_MS)));
  return row.failures >= MAX_FAILURES;
}

export async function recordFailure(ip) {
  await db.insert(loginAttempts).values({ ip, attemptedAt: Date.now() });
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, Date.now() - WINDOW_MS));
}

export async function clearFailures(ip) {
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
}
