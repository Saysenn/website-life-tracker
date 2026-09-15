import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(CURRENT_TIMESTAMP)`;

export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  paymentType: text("payment_type"),
  paymentMethod: text("payment_method"),
  createdAt: text("created_at").notNull().default(now),
});

export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    website: text("website"),
    groupId: integer("group_id").references(() => groups.id, { onDelete: "set null" }),
    paymentType: text("payment_type"),
    paymentMethod: text("payment_method"),
    currency: text("currency"),
    digirdpEmail: text("digirdp_email"),
    domainStart: text("domain_start"),
    domainEnd: text("domain_end"),
    domainClosedAt: text("domain_closed_at"),
    domainPrice: real("domain_price"),
    domainCurrency: text("domain_currency"),
    hostingStart: text("hosting_start"),
    hostingEnd: text("hosting_end"),
    hostingClosedAt: text("hosting_closed_at"),
    hostingPrice: real("hosting_price"),
    hostingCurrency: text("hosting_currency"),
    rdpStart: text("rdp_start"),
    rdpRenewal: text("rdp_renewal"),
    rdpClosedAt: text("rdp_closed_at"),
    rdpPrice: real("rdp_price"),
    rdpCurrency: text("rdp_currency"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [index("companies_group_idx").on(table.groupId)],
);

export const companyNames = sqliteTable(
  "company_names",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    changedAt: text("changed_at").notNull().default(now),
  },
  (table) => [index("company_names_company_idx").on(table.companyId)],
);

export const reminderLog = sqliteTable(
  "reminder_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    dueDate: text("due_date").notNull(),
    threshold: integer("threshold").notNull(),
    sentAt: text("sent_at").notNull().default(now),
  },
  (table) => [uniqueIndex("reminder_log_unique").on(table.companyId, table.service, table.dueDate, table.threshold)],
);

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  notifyEmail: text("notify_email"),
  reminderDays: text("reminder_days", { mode: "json" }).notNull().default(sql`'[30,14,7,3,1,0]'`),
  remindersEnabled: integer("reminders_enabled", { mode: "boolean" }).notNull().default(true),
  graceDays: integer("grace_days").notNull().default(6),
  currency: text("currency").notNull().default("GBP"),
  usdtRate: real("usdt_rate").notNull().default(1.35),
  rates: text("rates", { mode: "json" }).notNull().default(sql`'{}'`),
  ratesUpdatedAt: text("rates_updated_at"),
  servicePrices: text("service_prices", { mode: "json" }).notNull().default(sql`'{}'`),
  gasFees: text("gas_fees", { mode: "json" }).notNull().default(sql`'{}'`),
  gasCurrency: text("gas_currency"),
});

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ip: text("ip").notNull(),
    attemptedAt: integer("attempted_at").notNull(),
  },
  (table) => [index("login_attempts_ip_idx").on(table.ip, table.attemptedAt)],
);
