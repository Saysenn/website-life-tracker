"use server";

import { asc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, groups } from "@/db/schema";
import { SESSION_EXPIRED, fail, ok } from "@/lib/action-helpers";
import { getGroups, getPricing, getStatusRules, getToday } from "@/lib/data";
import { exportRow, groupForExport } from "@/lib/export";
import { isAdmin } from "@/lib/session";
import { unseal } from "@/lib/vault";

const exportSchema = z.object({
  groupIds: z.array(z.number().int().min(0)).min(1, "Pick at least one group."),
  includeArchived: z.boolean(),
});

export async function exportCompanies(input) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Pick at least one group.");

  const [rows, groupList, pricing, rules] = await Promise.all([
    db
      .select({ ...getTableColumns(companies), groupName: groups.name })
      .from(companies)
      .leftJoin(groups, eq(companies.groupId, groups.id))
      .orderBy(asc(sql`lower(${companies.name})`)),
    getGroups(),
    getPricing(),
    getStatusRules(),
  ]);
  const today = getToday();

  const sheets = groupForExport(rows, groupList, parsed.data).map((group) => ({
    name: group.name,
    rows: group.companies.map(({ digirdpPassword, providerPassword, ...company }) =>
      exportRow(company, { rdpKey: unseal(digirdpPassword), providerPassword: unseal(providerPassword) }, pricing, rules, today),
    ),
  }));

  if (!sheets.length) return fail("No companies in the picked groups.");
  return ok({ today, sheets });
}
