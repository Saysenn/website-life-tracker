"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { SESSION_EXPIRED, fail, ok } from "@/lib/action-helpers";
import { getSettings } from "@/lib/data";
import { defaultRecipient, mailError, sendMail } from "@/lib/mail";
import { runReminders, testEmail } from "@/lib/reminders";
import { isAdmin } from "@/lib/session";
import { normalizeGasFees, normalizePrices, normalizeRates } from "@/lib/money";
import { updateRates } from "@/lib/rates";
import { firstErrors, pricesSchema, settingsSchema } from "@/lib/validation";

export async function saveSettings(input) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail("Check the highlighted fields.", firstErrors(parsed.error));

  const values = { ...parsed.data, reminderDays: [...new Set(parsed.data.reminderDays)].sort((a, b) => b - a) };
  await db.insert(settings).values({ id: 1, ...values }).onConflictDoUpdate({ target: settings.id, set: values });
  revalidatePath("/settings");
  return ok(values);
}

export async function savePrices(input) {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);

  const parsed = pricesSchema.safeParse(input);
  if (!parsed.success) return fail("Check the highlighted fields.", firstErrors(parsed.error));

  const { currency, services, rates, gasFees, gasCurrency } = parsed.data;
  const values = {
    currency,
    rates: normalizeRates(rates),
    servicePrices: normalizePrices(services, currency),
    gasFees: normalizeGasFees(gasFees),
    gasCurrency,
  };
  await db.insert(settings).values({ id: 1, ...values }).onConflictDoUpdate({ target: settings.id, set: values });
  revalidatePath("/", "layout");
  return ok(values);
}

export async function refreshRates() {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);

  try {
    const { rates, ratesUpdatedAt } = await updateRates();
    revalidatePath("/", "layout");
    return ok({ rates, ratesUpdatedAt });
  } catch (error) {
    console.error("Rate refresh failed", error);
    return fail("Could not reach the exchange rate service. Your saved rates stay as they are.");
  }
}

export async function sendTestEmail() {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);

  const { notifyEmail } = await getSettings();
  const to = notifyEmail || defaultRecipient();
  try {
    await sendMail({ to, ...testEmail() });
    return ok({ to });
  } catch (error) {
    console.error("Test email failed", error);
    return fail(mailError(error));
  }
}

export async function runRemindersNow() {
  if (!(await isAdmin())) return fail(SESSION_EXPIRED);

  try {
    const result = await runReminders({ force: true });
    revalidatePath("/settings");
    return ok(result);
  } catch (error) {
    console.error("Reminder run failed", error);
    return fail(mailError(error));
  }
}
