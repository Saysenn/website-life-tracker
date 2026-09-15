import "server-only";
import nodemailer from "nodemailer";

let transporter;

export function mailStatus() {
  const sender = process.env.SMTP_USER?.trim() || null;
  return { configured: Boolean(sender && process.env.SMTP_PASSWORD), sender };
}

export function defaultRecipient() {
  return process.env.NOTIFY_EMAIL?.trim() || process.env.SMTP_USER?.trim() || "";
}

export async function sendMail({ to, subject, html, text }) {
  const { configured, sender } = mailStatus();
  if (!configured) throw new Error("SMTP_NOT_CONFIGURED");
  if (!to) throw new Error("NO_RECIPIENT");

  const port = Number(process.env.SMTP_PORT || 465);
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: sender, pass: process.env.SMTP_PASSWORD.replace(/\s+/g, "") },
  });

  await transporter.sendMail({ from: { name: "Life Tracker", address: sender }, to, subject, html, text });
}

export function mailError(error) {
  if (error?.message === "SMTP_NOT_CONFIGURED") return "Email is not set up yet. Add SMTP_USER and SMTP_PASSWORD.";
  if (error?.message === "NO_RECIPIENT") return "Add a recipient email first.";
  if (error?.code === "EAUTH") return "Gmail rejected the login. Use a Google App Password.";
  return "Could not send the email. Check your SMTP settings.";
}
