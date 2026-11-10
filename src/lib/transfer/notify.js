import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { transferChats } from "@/db/schema";
import { defaultRecipient, mailStatus, sendMail } from "@/lib/mail";
import { formatBytes } from "@/lib/tools/files";

const QUIET_MS = 10 * 60 * 1000;
const AWAY_MS = 60 * 1000;

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function appUrl() {
  const value = (process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
  if (!value) return null;
  return (/^https?:\/\//.test(value) ? value : `https://${value}`).replace(/\/+$/, "");
}

function describe(event) {
  if (event.type === "start") return { subject: `${event.chat.name} opened your file transfer link`, line: "Started a new chat." };
  if (event.type === "file") return { subject: `${event.chat.name} sent you a file`, line: `Sent ${event.name} (${formatBytes(event.size)}).` };
  return { subject: `New message from ${event.chat.name}`, line: "Sent you a message." };
}

/**
 * Emails the admin when a guest does something and the admin is not looking.
 * At most one email per chat every 10 minutes, except for a brand new chat.
 */
export function notifyAdmin(event) {
  const { chat } = event;
  const now = Date.now();
  if (!mailStatus().configured || !defaultRecipient()) return;
  if (event.type !== "start") {
    if (now - (chat.adminSeenAt ?? 0) < AWAY_MS) return;
    if (now - (chat.notifiedAt ?? 0) < QUIET_MS) return;
  }

  after(async () => {
    try {
      await db.update(transferChats).set({ notifiedAt: now }).where(eq(transferChats.id, chat.id));
      const { subject, line } = describe(event);
      const url = appUrl();
      const details = [chat.ip && `IP ${chat.ip}`, chat.location].filter(Boolean).join(" · ");
      const html = `<!doctype html><html><body style="margin:0;background:#F3EEE6;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1E1B16">
<div style="max-width:520px;margin:0 auto;padding:32px 16px"><div style="background:#FFFDFA;border-radius:16px;padding:28px">
<p style="margin:0 0 6px;font-size:12px;color:#8C8274">File transfer</p>
<h1 style="margin:0 0 12px;font-size:18px;font-weight:600">${escape(subject)}</h1>
<p style="margin:0;font-size:14px">${escape(line)}</p>
${details ? `<p style="margin:8px 0 0;font-size:12px;color:#8C8274">${escape(details)}</p>` : ""}
${url ? `<a href="${escape(url)}/tools/file-transfer?chat=${escape(chat.id)}" style="display:inline-block;margin-top:20px;padding:10px 16px;border-radius:10px;background:#1E1B16;color:#F3EEE6;font-size:13px;text-decoration:none">Open the chat</a>` : ""}
</div></div></body></html>`;
      await sendMail({ to: defaultRecipient(), subject, html, text: `${subject}\n${line}\n${details}` });
    } catch (error) {
      console.error("File transfer email failed", error);
    }
  });
}
