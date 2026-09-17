import { SettingsView } from "@/components/settings/settings-view";
import { ROUNDS } from "@/lib/constants";
import { getCompanies, getGroups, getPricing, getReminderLog, getSettings, TIMEZONE } from "@/lib/data";
import { defaultRecipient, mailStatus } from "@/lib/mail";
import { paymentOptions } from "@/lib/options";

export const metadata = { title: "Settings" };

const clock = (hour) => `${String(hour).padStart(2, "0")}:00`;

export default async function SettingsPage() {
  const [settings, log, pricing, companies, groups] = await Promise.all([
    getSettings(),
    getReminderLog(),
    getPricing(),
    getCompanies(),
    getGroups(),
  ]);
  const [daily, ...extra] = ROUNDS.map((round) => clock(round.hour));
  const cronTime = `${daily}, plus ${extra.join(" and ")} when something expires that day`;

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
