import "server-only";
import { gte } from "drizzle-orm";
import { db } from "@/db";
import { reminderLog } from "@/db/schema";
import { getCompanies, getSettings, getStatusRules, getToday } from "./data";
import { formatDate, relativeDays } from "./dates";
import { defaultRecipient, sendMail } from "./mail";
import { openStates } from "./services";
import { plural } from "./utils";

const keyOf = (item) => `${item.companyId}:${item.service}:${item.dueDate}:${item.threshold}`;

export async function findDueReminders(today, reminderDays, graceDays = 0) {
  const overdueSteps = Array.from({ length: graceDays }, (_, index) => -(index + 1)).reverse();
  const steps = [...overdueSteps, ...[...reminderDays].sort((a, b) => a - b)];
  const rules = await getStatusRules();
  const candidates = (await getCompanies()).flatMap((company) =>
    openStates(company, today, rules).flatMap(({ service, end, days, status }) => {
      const threshold = end ? steps.find((step) => days <= step) : undefined;
      if (threshold === undefined) return [];
      return [
        {
          companyId: company.id,
          company: company.name,
          group: company.groupName,
          paymentMethod: company.paymentMethod,
          digirdpEmail: company.digirdpEmail,
          service: service.key,
          serviceLabel: service.label,
          dueDate: end,
          days,
          status,
          threshold,
        },
      ];
    }),
  );
  if (!candidates.length) return [];

  const earliest = candidates.reduce((min, item) => (item.dueDate < min ? item.dueDate : min), candidates[0].dueDate);
  const sent = await db.select().from(reminderLog).where(gte(reminderLog.dueDate, earliest));
  const sentKeys = new Set(sent.map(keyOf));
  return candidates.filter((item) => !sentKeys.has(keyOf(item))).sort((a, b) => a.days - b.days);
}

export async function runReminders({ force = false } = {}) {
  const settings = await getSettings();
  if (!settings.remindersEnabled && !force) return { sent: 0, skipped: "disabled" };

  const recipient = settings.notifyEmail || defaultRecipient();
  const due = await findDueReminders(getToday(), settings.reminderDays, settings.graceDays);
  if (!due.length) return { sent: 0 };

  await sendMail({ to: recipient, ...reminderEmail(due) });
  await db
    .insert(reminderLog)
    .values(due.map(({ companyId, service, dueDate, threshold }) => ({ companyId, service, dueDate, threshold })))
    .onConflictDoNothing();
  return { sent: due.length };
}

const colors = {
  ground: "#F3EEE6",
  surface: "#FFFDFA",
  sunken: "#F6F2EB",
  ink: "#1E1B16",
  muted: "#8C8274",
  danger: "#A63F2A",
  warning: "#97620D",
};

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function appUrl() {
  const value = (process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
  if (!value) return null;
  return (/^https?:\/\//.test(value) ? value : `https://${value}`).replace(/\/+$/, "");
}

function layout(title, body) {
  const url = appUrl();
  const button = url
    ? `<a href="${escape(url)}/companies" style="display:inline-block;margin-top:20px;padding:10px 16px;border-radius:10px;background:${colors.ink};color:${colors.ground};font-size:13px;text-decoration:none">Open Life Tracker</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:${colors.ground};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${colors.ink}">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:${colors.surface};border-radius:16px;padding:28px">
<p style="margin:0 0 6px;font-size:12px;color:${colors.muted}">Life Tracker</p>
<h1 style="margin:0 0 20px;font-size:18px;font-weight:600;line-height:1.35">${escape(title)}</h1>
${body}${button}
</div>
<p style="margin:16px 0 0;text-align:center;font-size:11px;color:${colors.muted}">Sent because email reminders are on. You can change this in Settings.</p>
</div></body></html>`;
}

function itemRow(item) {
  const tone = item.days < 0 ? colors.danger : item.days <= 7 ? colors.warning : colors.ink;
  const flag = item.status === "rebuy" ? "Rebuy needed" : item.status === "suspended" ? "Suspended" : null;
  const details = [item.serviceLabel, flag, item.group, item.paymentMethod].filter(Boolean).map(escape).join(" · ");
  const account =
    item.service === "rdp" && item.digirdpEmail
      ? `<div style="margin-top:2px;font-size:12px;color:${colors.muted}">DigiRDP ${escape(item.digirdpEmail)}</div>`
      : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;background:${colors.sunken};border-radius:12px"><tr>
<td style="padding:12px 14px"><div style="font-size:14px;font-weight:600">${escape(item.company)}</div><div style="margin-top:2px;font-size:12px;color:${colors.muted}">${details}</div>${account}</td>
<td align="right" style="padding:12px 14px;white-space:nowrap"><div style="font-size:13px;font-weight:600;color:${tone}">${escape(relativeDays(item.days))}</div><div style="margin-top:2px;font-size:12px;color:${colors.muted}">${escape(formatDate(item.dueDate))}</div></td>
</tr></table>`;
}

export function reminderEmail(items) {
  const overdue = items.filter((item) => item.days < 0).length;
  const [first] = items;
  const subject =
    items.length === 1
      ? `${first.company} ${first.serviceLabel}: ${relativeDays(first.days).toLowerCase()}`
      : `${plural(items.length, "renewal")} need attention${overdue ? `, ${overdue} overdue` : ""}`;
  const text = items
    .map((item) => `${item.company}, ${item.serviceLabel}: ${relativeDays(item.days)} (${formatDate(item.dueDate)})`)
    .join("\n");
  return { subject, text, html: layout(subject, items.map(itemRow).join("")) };
}

export function testEmail() {
  const subject = "Life Tracker test email";
  const message = "Email is working. Renewal reminders for your domains, hosting and RDPs will arrive at this address.";
  return {
    subject,
    text: message,
    html: layout("Your email is connected", `<p style="margin:0;font-size:14px;line-height:1.6">${message}</p>`),
  };
}
