import { SettingsView } from "@/components/settings/settings-view";
import { getCompanies, getGroups, getPricing, getReminderLog, getSettings, TIMEZONE } from "@/lib/data";
import { defaultRecipient, mailStatus } from "@/lib/mail";
import { paymentOptions } from "@/lib/options";

export const metadata = { title: "Settings" };

const CRON_UTC_HOUR = 5;

export default async function SettingsPage() {
  const [settings, log, pricing, companies, groups] = await Promise.all([
    getSettings(),
    getReminderLog(),
    getPricing(),
    getCompanies(),
    getGroups(),
  ]);
  const cronTime = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(Date.UTC(2026, 0, 1, CRON_UTC_HOUR));

  return (
    <SettingsView
      settings={settings}
      log={log}
      pricing={pricing}
      methods={paymentOptions(companies, groups).paymentMethods}
      mail={{ ...mailStatus(), fallback: defaultRecipient() }}
      timezone={TIMEZONE}
      cronTime={cronTime}
    />
  );
}
