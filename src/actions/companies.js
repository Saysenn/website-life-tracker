"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, companyNames, groups, reminderLog } from "@/db/schema";
import { SESSION_EXPIRED, done, ensureGroup, fail, ok } from "@/lib/action-helpers";
import { isISODate } from "@/lib/dates";
import { SERVICE_BY_KEY } from "@/lib/services";
import { isAdmin } from "@/lib/session";
import { accountRowSchema, companySchema, firstErrors, idSchema } from "@/lib/validation";
import { seal, unseal } from "@/lib/vault";

const validId = (value) => idSchema.safeParse(value).success;

const SECRET_FIELDS = ["providerPassword", "digirdpPassword"];
const SECRETS = {
  key: { column: companies.digirdpPassword, missing: "No RDP key saved for this company." },
  provider: { column: companies.providerPassword, missing: "No provider password saved for this company." },
};

export async function saveCompany(companyId, input) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  if (companyId !== null && !validId(companyId)) return fail("Unknown company.");

  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return fail("Check the highlighted fields.", firstErrors(parsed.error));

  const { group, ...values } = parsed.data;
  values.groupId = await ensureGroup(group, values);

  for (const key of SECRET_FIELDS) {
    if (values[key]) values[key] = seal(values[key]);
    else delete values[key];
  }

  if (companyId === null) {
    const [row] = await db.insert(companies).values(values).returning({ id: companies.id });
    return done({ id: row.id });
  }

  const [current] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId));
  if (!current) return fail("This company no longer exists.");

  await db
    .update(companies)
    .set({ ...values, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(companies.id, companyId));

  if (current.name !== values.name) {
    await db.insert(companyNames).values({ companyId, name: current.name });
  }
  return done({ id: companyId });
}

export async function deleteCompany(companyId) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  if (!validId(companyId)) return fail("Unknown company.");

  await db.batch([
    db.delete(reminderLog).where(eq(reminderLog.companyId, companyId)),
    db.delete(companyNames).where(eq(companyNames.companyId, companyId)),
    db.delete(companies).where(eq(companies.id, companyId)),
  ]);
  return done();
}

export async function moveCompany(companyId, groupId) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  if (!validId(companyId) || (groupId !== null && !validId(groupId))) return fail("Unknown company or group.");

  if (groupId !== null) {
    const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId));
    if (!group) return fail("That group no longer exists.");
  }

  await db
    .update(companies)
    .set({ groupId, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(companies.id, companyId));
  return done();
}

export async function closeService(companyId, serviceKey) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  const service = SERVICE_BY_KEY[serviceKey];
  if (!validId(companyId) || !service) return fail("Unknown company or service.");

  await db
    .update(companies)
    .set({ [service.closed]: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(companies.id, companyId));
  return done();
}

export async function reopenService(companyId, serviceKey) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  const service = SERVICE_BY_KEY[serviceKey];
  if (!validId(companyId) || !service) return fail("Unknown company or service.");

  await db
    .update(companies)
    .set({ [service.closed]: null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(companies.id, companyId));
  return done();
}

export async function setServiceDates(companyId, serviceKey, dates) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  const service = SERVICE_BY_KEY[serviceKey];
  if (!validId(companyId) || !service) return fail("Unknown company or service.");

  const start = dates?.start ?? null;
  const end = dates?.end ?? null;
  if ([start, end].some((date) => date !== null && !isISODate(date))) return fail("Pick a valid date.");
  if (start && end && end < start) return fail("The end date must be after the start date.");

  await db
    .update(companies)
    .set({ [service.start]: start, [service.end]: end, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(companies.id, companyId));
  return done();
}

export async function revealPassword(companyId, kind = "key") {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  const secret = SECRETS[kind];
  if (!validId(companyId) || !secret) return fail("Unknown company.");

  const [row] = await db.select({ secret: secret.column }).from(companies).where(eq(companies.id, companyId));
  if (!row) return fail("This company no longer exists.");

  const password = unseal(row.secret);
  return password ? ok({ password }) : fail(secret.missing);
}

export async function importAccounts(rows) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  if (!Array.isArray(rows) || !rows.length) return fail("Nothing to import.");

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const parsed = accountRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const { id, name, group, account, providerPassword, password } = parsed.data;

    const values = {
      ...(account ? { digirdpEmail: account } : {}),
      ...(providerPassword ? { providerPassword: seal(providerPassword) } : {}),
      ...(password ? { digirdpPassword: seal(password) } : {}),
    };

    if (id) {
      const groupId = group ? await ensureGroup(group, {}) : undefined;
      await db
        .update(companies)
        .set({ ...values, ...(groupId ? { groupId } : {}), updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(companies.id, id));
      updated += 1;
    } else {
      await db.insert(companies).values({ name, groupId: await ensureGroup(group, {}), ...values });
      created += 1;
    }
  }

  if (!created && !updated) return fail("Nothing could be imported.");
  return done({ created, updated });
}
