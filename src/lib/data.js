import "server-only";
import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { companies, companyNames, groups, reminderLog, settings } from "@/db/schema";
import { DEFAULT_CURRENCY, DEFAULT_GRACE_DAYS, DEFAULT_REMINDER_DAYS, DEFAULT_USDT_RATE } from "./constants";
import { todayIn } from "./dates";
import { normalizePricing } from "./money";

export const TIMEZONE = process.env.APP_TIMEZONE || "Asia/Dubai";

const byName = (column) => asc(sql`lower(${column})`);

export const getToday = () => todayIn(TIMEZONE);

export const getCompanies = cache(async () => {
  const rows = await db
    .select({ ...getTableColumns(companies), groupName: groups.name })
    .from(companies)
    .leftJoin(groups, eq(companies.groupId, groups.id))
    .orderBy(byName(companies.name));

  return rows.map(({ digirdpPassword, providerPassword, ...company }) => ({
    ...company,
    hasPassword: Boolean(digirdpPassword),
    hasProviderPassword: Boolean(providerPassword),
  }));
});

export const getGroups = cache(() => db.select().from(groups).orderBy(byName(groups.name)));

export const getNameHistory = cache(() =>
  db.select().from(companyNames).orderBy(desc(companyNames.changedAt), desc(companyNames.id)),
);

export const getSettings = cache(async () => {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return {
    notifyEmail: row?.notifyEmail ?? "",
    reminderDays: row?.reminderDays ?? DEFAULT_REMINDER_DAYS,
    remindersEnabled: row?.remindersEnabled ?? true,
    graceDays: row?.graceDays ?? DEFAULT_GRACE_DAYS,
    currency: row?.currency ?? DEFAULT_CURRENCY,
    usdtRate: row?.usdtRate ?? DEFAULT_USDT_RATE,
    rates: row?.rates ?? {},
    ratesUpdatedAt: row?.ratesUpdatedAt ?? null,
    servicePrices: row?.servicePrices ?? {},
    gasFees: row?.gasFees ?? {},
    gasCurrency: row?.gasCurrency ?? null,
  };
});

export const getPricing = cache(async () => normalizePricing(await getSettings()));

export const getStatusRules = cache(async () => {
  const { reminderDays, graceDays } = await getSettings();
  return { window: Math.max(0, ...reminderDays), grace: graceDays };
});

export function getReminderLog(limit = 12) {
  return db
    .select({
      id: reminderLog.id,
      company: companies.name,
      service: reminderLog.service,
      dueDate: reminderLog.dueDate,
      sentAt: reminderLog.sentAt,
    })
    .from(reminderLog)
    .innerJoin(companies, eq(reminderLog.companyId, companies.id))
    .orderBy(desc(reminderLog.sentAt), desc(reminderLog.id))
    .limit(limit);
}
