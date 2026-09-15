import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const digest = (value) => createHash("sha256").update(String(value)).digest();

export function verifyAdmin(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;
  if (typeof username !== "string" || typeof password !== "string") return false;
  const userOk = timingSafeEqual(digest(username.trim()), digest(expectedUser));
  const passwordOk = timingSafeEqual(digest(password), digest(expectedPassword));
  return userOk && passwordOk;
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
