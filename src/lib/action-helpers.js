import "server-only";
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

/** Group names are encrypted in the database, so the case-insensitive match happens here. */
export async function findGroupByName(name) {
  const wanted = String(name ?? "").toLowerCase();
  const rows = await db.select({ id: groups.id, name: groups.name }).from(groups);
  const row = rows.find((group) => group.name.toLowerCase() === wanted);
  return row ? { id: row.id } : null;
}

export async function ensureGroup(name, { paymentType, paymentMethod }) {
  if (!name) return null;
  const existing = await findGroupByName(name);
  if (existing) return existing.id;
  const [created] = await db.insert(groups).values({ name, paymentType, paymentMethod }).returning({ id: groups.id });
  return created.id;
}
