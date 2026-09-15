import "server-only";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { groups } from "@/db/schema";

export const SESSION_EXPIRED = "Your session expired. Sign in again.";

export const ok = (data = null) => ({ ok: true, data });

export const fail = (error, fieldErrors) => ({ ok: false, error, fieldErrors });

export function done(data = null) {
  revalidatePath("/", "layout");
  return ok(data);
}

export async function findGroupByName(name) {
  const [row] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(sql`lower(${groups.name}) = lower(${name})`)
    .limit(1);
  return row ?? null;
}

export async function ensureGroup(name, { paymentType, paymentMethod }) {
  if (!name) return null;
  const existing = await findGroupByName(name);
  if (existing) return existing.id;
  const [created] = await db.insert(groups).values({ name, paymentType, paymentMethod }).returning({ id: groups.id });
  return created.id;
}
