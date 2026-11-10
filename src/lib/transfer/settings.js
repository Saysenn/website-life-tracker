import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transferLink } from "@/db/schema";
import { RETENTION_MS } from "./constants";

const CACHE_MS = 10_000;
let cached = null;

/** Whether chats and files delete themselves RETENTION_DAYS after a chat starts. On unless the admin turned it off. */
export async function autoDeleteOn() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const row = await db.query.transferLink.findFirst({ where: eq(transferLink.id, 1), columns: { autoDelete: true } });
  const value = row?.autoDelete ?? true;
  cached = { value, at: Date.now() };
  return value;
}

export function rememberAutoDelete(value) {
  cached = { value, at: Date.now() };
}

/** When a chat started at createdAt gets deleted, or null when auto-delete is off. */
export const expiryOf = (createdAt, on) => (on ? createdAt + RETENTION_MS : null);
