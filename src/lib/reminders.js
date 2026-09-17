import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { digestLog, reminderLog } from "@/db/schema";
import { ROUNDS } from "./constants";
import { getCompanies, getSettings, getStatusRules, getToday } from "./data";
import { formatDate, relativeDays } from "./dates";
import { defaultRecipient, sendMail } from "./mail";
import { openStates } from "./services";
import { plural } from "./utils";

export function roundFor(hour) {
  const match = [...ROUNDS].reverse().find((round) => hour >= round.hour);
  return (match ?? ROUNDS[0]).key;
}

export async function buildDigest(today, rules) {
  const items = (await getCompanies()).flatMap((company) =>
    openStates(company, today, rules)
      .filter(({ end, days }) => end && days <= rules.window)
      .map(({ service, end, days, status }) => ({
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
      })),
  );
  items.sort((a, b) => a.days - b.days || a.company.localeCompare(b.company));

  return {
    expiring: items.filter((item) => item.days === 0),
    overdue: items.filter((item) => item.days < 0),
    upcoming: items.filter((item) => item.days > 0),
    count: items.length,
    window: rules.window,
    grace: rules.grace,
  };
}

async function claimRound(day, round, items) {
  const claimed = await db.insert(digestLog).values({ day, round, items }).onConflictDoNothing().returning();
  return claimed.length > 0;
}

export async function runReminders({ round = "noon", force = false } = {}) {
  const settings = await getSettings();
  if (!settings.remindersEnabled && !force) return { sent: 0, skipped: "disabled" };

  const today = getToday();
  const digest = await buildDigest(today, await getStatusRules());
  if (!digest.count) return { sent: 0, skipped: "nothing due" };
  if (round !== "noon" && !digest.expiring.length && !force) return { sent: 0, skipped: "nothing expires today" };
  if (!force && !(await claimRound(today, round, digest.count))) return { sent: 0, skipped: "already sent" };

  try {
    await sendMail({ to: settings.notifyEmail || defaultRecipient(), ...reminderEmail(digest, round) });
  } catch (error) {
    if (!force) await db.delete(digestLog).where(and(eq(digestLog.day, today), eq(digestLog.round, round)));
    throw error;
  }

  const seen = [...digest.expiring, ...digest.overdue, ...digest.upcoming];
  await db
    .insert(reminderLog)
    .values(seen.map(({ companyId, service, dueDate, days }) => ({ companyId, service, dueDate, threshold: days })))
    .onConflictDoNothing();

  return { sent: digest.count, round };
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

function flagOf(item, grace) {
  if (item.status === "rebuy") return "Rebuy needed";
  if (item.status === "suspended") return `Suspended, day ${-item.days} of ${grace}`;
  if (item.status === "ended") return "Ended";
  return null;
}

function itemRow(item, grace) {
  const tone = item.days < 0 ? colors.danger : item.days === 0 ? colors.danger : colors.warning;
  const details = [item.serviceLabel, flagOf(item, grace), item.group, item.paymentMethod]
    .filter(Boolean)
    .map(escape)
    .join(" · ");
  const account =
    item.service === "rdp" && item.digirdpEmail
      ? `<div style="margin-top:2px;font-size:12px;color:${colors.muted}">DigiRDP ${escape(item.digirdpEmail)}</div>`
      : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;background:${colors.sunken};border-radius:12px"><tr>
<td style="padding:12px 14px"><div style="font-size:14px;font-weight:600">${escape(item.company)}</div><div style="margin-top:2px;font-size:12px;color:${colors.muted}">${details}</div>${account}</td>
<td align="right" style="padding:12px 14px;white-space:nowrap"><div style="font-size:13px;font-weight:600;color:${tone}">${escape(relativeDays(item.days))}</div><div style="margin-top:2px;font-size:12px;color:${colors.muted}">${escape(formatDate(item.dueDate))}</div></td>
</tr></table>`;
}

function group(title, items, grace) {
  if (!items.length) return "";
  return `<p style="margin:22px 0 10px;font-size:12px;font-weight:600;letter-spacing:0.02em;color:${colors.muted}">${escape(title)}</p>${items
    .map((item) => itemRow(item, grace))
    .join("")}`;
}

export function reminderEmail(digest, round = "noon") {
  const { expiring, overdue, upcoming, grace, window } = digest;
  const parts = [];
  if (expiring.length) parts.push(`${expiring.length} expiring today`);
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (upcoming.length) parts.push(`${upcoming.length} within ${plural(window, "day")}`);

  const marker = ROUNDS.find((item) => item.key === round);
  const headline = parts.join(", ") || "Renewals update";
  const subject = round === "noon" ? headline : `${headline} · ${marker.label}`;

  const text = [...expiring, ...overdue, ...upcoming]
    .map((item) => `${item.company}, ${item.serviceLabel}: ${relativeDays(item.days)} (${formatDate(item.dueDate)})`)
    .join("\n");

  const body = [
    group("Expiring today", expiring, grace),
    group("Overdue", overdue, grace),
    group(`Next ${plural(window, "day")}`, upcoming, grace),
  ].join("");

  return { subject, text, html: layout(headline, body) };
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
