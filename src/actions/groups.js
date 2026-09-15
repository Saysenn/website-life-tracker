"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, groups } from "@/db/schema";
import { SESSION_EXPIRED, done, fail, findGroupByName } from "@/lib/action-helpers";
import { isAdmin } from "@/lib/session";
import { firstErrors, groupSchema, idSchema } from "@/lib/validation";

export async function saveGroup(groupId, input) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  if (groupId !== null && !idSchema.safeParse(groupId).success) return fail("Unknown group.");

  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return fail("Check the highlighted fields.", firstErrors(parsed.error));

  const { name, paymentType, paymentMethod, applyToCompanies } = parsed.data;
  const clash = await findGroupByName(name);
  if (clash && clash.id !== groupId) return fail("That group already exists.", { name: "That group already exists" });

  if (groupId === null) {
    const [row] = await db.insert(groups).values({ name, paymentType, paymentMethod }).returning({ id: groups.id });
    return done({ id: row.id });
  }

  const rows = await db
    .update(groups)
    .set({ name, paymentType, paymentMethod })
    .where(eq(groups.id, groupId))
    .returning({ id: groups.id });
  if (!rows.length) return fail("This group no longer exists.");

  if (applyToCompanies) {
    await db
      .update(companies)
      .set({ paymentType, paymentMethod, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(companies.groupId, groupId));
  }
  return done({ id: groupId });
}

export async function deleteGroup(groupId) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  if (!idSchema.safeParse(groupId).success) return fail("Unknown group.");

  await db.batch([
    db.update(companies).set({ groupId: null }).where(eq(companies.groupId, groupId)),
    db.delete(groups).where(eq(groups.id, groupId)),
  ]);
  return done();
}
