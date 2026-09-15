import { timingSafeEqual } from "node:crypto";
import { updateRates } from "@/lib/rates";
import { runReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let rates = "updated";
  try {
    await updateRates();
  } catch (error) {
    rates = "unchanged";
    console.error("Rate refresh failed", error);
  }

  try {
    const { sent, skipped } = await runReminders();
    return Response.json({ sent, skipped, rates });
  } catch (error) {
    console.error("Reminder run failed", error);
    return Response.json({ error: "Reminder run failed" }, { status: 500 });
  }
}
