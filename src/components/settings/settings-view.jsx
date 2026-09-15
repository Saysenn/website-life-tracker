"use client";

import { Bell, CircleCheck, History, Inbox, Play, Plus, RefreshCw, Send, TriangleAlert, Wallet, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { refreshRates, runRemindersNow, savePrices, saveSettings, sendTestEmail } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/field";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { Switch } from "@/components/ui/switch";
import { COMMON_CURRENCIES } from "@/lib/constants";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { formatMoney, formatUsdt } from "@/lib/money";
import { BILLABLE, SERVICE_BY_KEY } from "@/lib/services";
import { cn, plural } from "@/lib/utils";

const SECTIONS = [
  { key: "reminders", label: "Reminders", hint: "When emails go out", icon: Bell },
  { key: "prices", label: "Renewal prices", hint: "What each service costs", icon: Wallet },
  { key: "delivery", label: "Delivery", hint: "Gmail connection", icon: Send },
  { key: "history", label: "History", hint: "Emails already sent", icon: History },
];

const dayLabel = (day) => (day === 0 ? "On the day" : `${plural(day, "day")} before`);

function RemindersSection({ settings, cronTime, timezone, mail }) {
  const [values, setValues] = useState(settings);
  const [dayInput, setDayInput] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, startSaving] = useTransition();
  const dirty =
    values.notifyEmail !== settings.notifyEmail ||
    values.reminderDays.join() !== settings.reminderDays.join() ||
    values.graceDays !== settings.graceDays;

  function persist(next, message) {
    startSaving(async () => {
      const result = await saveSettings(next);
      if (result.ok) {
        setErrors({});
        toast.success(message);
      } else {
        setErrors(result.fieldErrors ?? {});
        setValues(settings);
        toast.error(result.error);
      }
    });
  }

  function toggleReminders(enabled) {
    setValues((current) => ({ ...current, remindersEnabled: enabled }));
    persist({ ...settings, remindersEnabled: enabled }, enabled ? "Email reminders turned on" : "Email reminders turned off");
  }

  function addDay(event) {
    event.preventDefault();
    const day = Number(dayInput);
    if (dayInput === "" || !Number.isInteger(day) || day < 0 || day > 365) {
      setErrors({ reminderDays: "Use a whole number from 0 to 365" });
      return;
    }
    setValues((current) => ({ ...current, reminderDays: [...new Set([...current.reminderDays, day])].sort((a, b) => b - a) }));
    setDayInput("");
    setErrors({});
  }

  const removeDay = (day) =>
    setValues((current) => ({ ...current, reminderDays: current.reminderDays.filter((item) => item !== day) }));

  return (
    <Card
      title="Email reminders"
      description={`Checked every day at ${cronTime} (${timezone}). One digest email lists everything due.`}
      actions={<Switch checked={values.remindersEnabled} onCheckedChange={toggleReminders} aria-label="Send reminder emails" />}
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          persist(values, "Reminder settings saved");
        }}
      >
        <Field
          label="Send reminders to"
          htmlFor="notify-email"
          error={errors.notifyEmail}
          hint={mail.fallback ? `Leave empty to use ${mail.fallback}` : "Where reminder emails should go"}
        >
          <Input
            id="notify-email"
            type="email"
            value={values.notifyEmail}
            onChange={(event) => setValues((current) => ({ ...current, notifyEmail: event.target.value }))}
            aria-invalid={errors.notifyEmail ? true : undefined}
            placeholder={mail.fallback || "you@gmail.com"}
            className="max-w-[40rem]"
          />
        </Field>

        <Field label="Remind me" htmlFor="reminder-day" error={errors.reminderDays} hint="Days before the end date. 0 sends on the day itself.">
          <div className="flex flex-wrap items-center gap-1.5">
            {values.reminderDays.map((day) => (
              <span key={day} className="inline-flex h-7 items-center gap-1 rounded-full bg-sunken pr-1 pl-2.5 text-sm text-ink-2 animate-pop">
                {dayLabel(day)}
                <button
                  type="button"
                  onClick={() => removeDay(day)}
                  aria-label={`Remove ${dayLabel(day)}`}
                  className="flex size-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                >
                  <X className="size-[1.1rem]" />
                </button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <Input
                id="reminder-day"
                type="number"
                min={0}
                max={365}
                inputMode="numeric"
                value={dayInput}
                onChange={(event) => setDayInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addDay(event)}
                placeholder="Days"
                className="h-7 w-20 rounded-full px-3 text-sm"
              />
              <Button variant="soft" size="icon-sm" onClick={addDay} aria-label="Add reminder day" className="rounded-full">
                <Plus />
              </Button>
            </span>
          </div>
        </Field>

        <Field
          label="Grace period after the end date"
          htmlFor="grace-days"
          error={errors.graceDays}
          hint="An RDP shows as Suspended for this many days after its renewal date and still gets a reminder every day. After that it needs rebuying."
        >
          <div className="flex items-center gap-2">
            <Input
              id="grace-days"
              type="number"
              min={0}
              max={60}
              inputMode="numeric"
              value={values.graceDays}
              onChange={(event) => setValues((current) => ({ ...current, graceDays: Number(event.target.value) || 0 }))}
              aria-invalid={errors.graceDays ? true : undefined}
              className="w-24"
            />
            <span className="text-sm text-ink-3">days</span>
          </div>
        </Field>

        <div className="flex items-center justify-end gap-2">
          {dirty && <span className="mr-auto text-xs text-ink-3 animate-fade">You have unsaved changes</span>}
          <Button type="submit" pending={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PricesSection({ pricing, methods, timezone }) {
  const [values, setValues] = useState(() => ({
    currency: pricing.currency,
    services: pricing.prices,
    rates: pricing.rates,
    gasCurrency: pricing.gasCurrency,
    gasFees: Object.fromEntries(methods.map((method) => [method, pricing.gasFees[method] ?? ""])),
  }));
  const [errors, setErrors] = useState({});
  const [saving, startSaving] = useTransition();
  const [refreshing, startRefreshing] = useTransition();
  const dirty =
    JSON.stringify(values) !==
    JSON.stringify({
      currency: pricing.currency,
      services: pricing.prices,
      rates: pricing.rates,
      gasCurrency: pricing.gasCurrency,
      gasFees: Object.fromEntries(methods.map((method) => [method, pricing.gasFees[method] ?? ""])),
    });

  const setService = (key, field, value) =>
    setValues((current) => ({
      ...current,
      services: { ...current.services, [key]: { ...current.services[key], [field]: value } },
    }));

  const currencies = [
    ...new Set([
      values.currency,
      values.gasCurrency,
      ...BILLABLE.map((service) => values.services[service.key].currency),
      ...Object.keys(values.rates),
    ]),
  ].filter((currency) => currency && currency !== "USDT");
  const currencyOptions = [...new Set([...COMMON_CURRENCIES, ...currencies])];

  const converted = (service) => {
    const amount = Number(values.services[service.key].price);
    const currency = values.services[service.key].currency;
    const rate = Number(values.rates[currency]);
    return values.services[service.key].price !== "" &&
      values.services[service.key].price !== null &&
      Number.isFinite(amount) &&
      Number.isFinite(rate)
      ? `${formatMoney(amount, currency)} is ${formatUsdt(amount * rate)}`
      : "Used when a company has no price of its own";
  };

  function refresh() {
    startRefreshing(async () => {
      const result = await refreshRates();
      if (result.ok) {
        setValues((current) => ({ ...current, rates: { ...current.rates, ...result.data.rates } }));
        toast.success("Rates updated from the exchange rate service");
      } else {
        toast.error(result.error);
      }
    });
  }

  function submit(event) {
    event.preventDefault();
    startSaving(async () => {
      const result = await savePrices(values);
      if (result.ok) {
        setErrors({});
        toast.success("Renewal prices saved");
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return (
    <Card title="Renewal prices" description="What RDPs cost to renew, and what each transfer costs in gas">
      <form onSubmit={submit} className="grid gap-5">
        <Field label="Main currency" htmlFor="currency" error={errors.currency} hint="Used when a price has no currency of its own">
          <Combobox
            id="currency"
            value={values.currency}
            onChange={(value) => setValues((current) => ({ ...current, currency: value }))}
            options={currencyOptions}
            className="max-w-[14rem]"
          />
        </Field>

        <div className="grid gap-3 rounded-xl bg-sunken/70 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">USDT rates</p>
              <p className="text-xs text-ink-3">
                {pricing.ratesUpdatedAt
                  ? `Updated ${formatTimestamp(pricing.ratesUpdatedAt, timezone)}`
                  : "Refresh to pull live rates, or type your own"}
              </p>
            </div>
            <Button variant="soft" size="sm" onClick={refresh} pending={refreshing}>
              {!refreshing && <RefreshCw />} Refresh rates
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {currencies.map((currency) => (
              <label key={currency} className="flex items-center gap-2 text-sm text-ink-2">
                <span className="w-14 shrink-0 tabular-nums">1 {currency}</span>
                <Input
                  value={values.rates[currency] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, rates: { ...current.rates, [currency]: event.target.value } }))
                  }
                  aria-label={`USDT for one ${currency}`}
                  inputMode="decimal"
                  className="h-8 max-w-[11rem]"
                />
                <span className="text-ink-3">USDT</span>
              </label>
            ))}
          </div>
        </div>

        {BILLABLE.map((service) => (
          <div key={service.key} className="grid gap-3 rounded-xl bg-sunken/70 p-3.5 sm:grid-cols-2">
            <p className="text-sm font-semibold sm:col-span-2">{service.label}</p>
            <Field label="Provider" htmlFor={`provider-${service.key}`} error={errors[`services.${service.key}.provider`]}>
              <Input
                id={`provider-${service.key}`}
                value={values.services[service.key].provider}
                onChange={(event) => setService(service.key, "provider", event.target.value)}
                placeholder={service.key === "rdp" ? "DigiRDP" : "Who you buy it from"}
                autoComplete="off"
              />
            </Field>
            <Field
              label={`Renewal price ${service.cycle}`}
              htmlFor={`price-${service.key}`}
              error={errors[`services.${service.key}.price`] ?? errors[`services.${service.key}.currency`]}
              hint={converted(service)}
            >
              <div className="flex gap-2">
                <Input
                  id={`price-${service.key}`}
                  value={values.services[service.key].price ?? ""}
                  onChange={(event) => setService(service.key, "price", event.target.value)}
                  aria-invalid={errors[`services.${service.key}.price`] ? true : undefined}
                  placeholder="35.81"
                  inputMode="decimal"
                  autoComplete="off"
                />
                <Combobox
                  id={`currency-${service.key}`}
                  value={values.services[service.key].currency}
                  onChange={(value) => setService(service.key, "currency", value)}
                  options={currencyOptions}
                  className="max-w-[11rem]"
                />
              </div>
            </Field>
          </div>
        ))}

        <div className="grid gap-3 rounded-xl bg-sunken/70 p-3.5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Network fees</p>
              <p className="text-xs text-ink-3">
                Charged once per transfer. The renewal preview adds these to the total you send.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-3">
              Fees are in
              <Combobox
                value={values.gasCurrency}
                onChange={(value) => setValues((current) => ({ ...current, gasCurrency: value }))}
                options={currencyOptions}
                className="h-8 w-28"
              />
            </label>
          </div>
          {methods.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map((method) => (
                <label key={method} className="flex items-center gap-2 text-sm text-ink-2">
                  <span className="w-28 shrink-0 truncate">{method}</span>
                  <Input
                    value={values.gasFees[method] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, gasFees: { ...current.gasFees, [method]: event.target.value } }))
                    }
                    aria-label={`Gas fee for ${method}`}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-8 max-w-[11rem]"
                  />
                  <span className="text-ink-3">{values.gasCurrency}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-3">Payment methods show up here once your companies use them.</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" pending={saving} disabled={!dirty}>
            Save prices
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DeliverySection({ mail }) {
  const [testing, startTesting] = useTransition();
  const [running, startRunning] = useTransition();

  function sendTest() {
    startTesting(async () => {
      const result = await sendTestEmail();
      if (result.ok) toast.success("Test email sent", { description: `Check ${result.data.to}` });
      else toast.error(result.error);
    });
  }

  function runNow() {
    startRunning(async () => {
      const result = await runRemindersNow();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { sent } = result.data;
      if (sent) toast.success(`${plural(sent, "reminder")} sent`, { description: "Check your inbox for the digest" });
      else toast.info("Nothing due right now", { description: "No renewal hits a reminder day today" });
    });
  }

  return (
    <Card title="Delivery" description="Gmail SMTP sends the emails">
      <div className="flex items-start gap-3 rounded-xl bg-sunken/70 p-3.5">
        {mail.configured ? (
          <CircleCheck className="mt-0.5 size-[1.6rem] shrink-0 text-success" strokeWidth={1.75} />
        ) : (
          <TriangleAlert className="mt-0.5 size-[1.6rem] shrink-0 text-warning" strokeWidth={1.75} />
        )}
        <div className="min-w-0 text-sm">
          {mail.configured ? (
            <>
              <p className="font-medium">Connected</p>
              <p className="text-ink-3">Sending from {mail.sender}</p>
            </>
          ) : (
            <>
              <p className="font-medium">Email is not set up yet</p>
              <p className="text-ink-3">
                Add SMTP_USER and SMTP_PASSWORD to your environment. Use a Google App Password, not your normal password.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="soft" onClick={sendTest} pending={testing} disabled={!mail.configured}>
          {!testing && <Send />} Send test email
        </Button>
        <Button variant="soft" onClick={runNow} pending={running} disabled={!mail.configured}>
          {!running && <Play />} Run check now
        </Button>
      </div>
    </Card>
  );
}

function HistorySection({ log, timezone }) {
  return (
    <Card title="Recent reminders" description="The last emails the daily check sent">
      {log.length ? (
        <ul className="-mx-2 grid">
          {log.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.company}</p>
                <p className="text-xs text-ink-3">
                  {SERVICE_BY_KEY[entry.service]?.label ?? entry.service} ends {formatDate(entry.dueDate)}
                </p>
              </div>
              <span className="shrink-0 text-xs text-ink-3 tabular-nums">{formatTimestamp(entry.sentAt, timezone)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <Inbox className="size-[2.2rem] text-ink-4" strokeWidth={1.5} />
          <p className="mt-2 text-sm font-medium">No reminders sent yet</p>
          <p className="mt-0.5 text-xs text-ink-3">They show up here after the daily check emails you.</p>
        </div>
      )}
    </Card>
  );
}

export function SettingsView({ settings, log, mail, pricing, methods, timezone, cronTime }) {
  const searchParams = useSearchParams();
  const initial = SECTIONS.some((section) => section.key === searchParams.get("section"))
    ? searchParams.get("section")
    : SECTIONS[0].key;
  const [section, setSection] = useState(initial);

  function select(key) {
    setSection(key);
    const url = new URL(window.location.href);
    url.searchParams.set("section", key);
    window.history.replaceState(null, "", url);
  }

  return (
    <Page className="max-w-[112rem]">
      <PageHeader title="Settings" description="Reminders, prices and delivery for your renewals" />

      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:gap-6">
        <nav
          aria-label="Settings sections"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:w-[24rem] lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {SECTIONS.map(({ key, label, hint, icon: Icon }) => {
            const active = key === section;
            return (
              <button
                key={key}
                type="button"
                onClick={() => select(key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm whitespace-nowrap text-ink-2 transition-colors hover:bg-hover hover:text-ink lg:w-full lg:whitespace-normal",
                  active && "bg-surface text-ink shadow-card hover:bg-surface",
                )}
              >
                <Icon className="size-[1.5rem] shrink-0 text-ink-3" strokeWidth={1.75} />
                <span className="min-w-0">
                  <span className={cn("block truncate", active && "font-medium")}>{label}</span>
                  <span className="hidden text-xs text-ink-3 lg:block">{hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {section === "reminders" && (
            <RemindersSection settings={settings} cronTime={cronTime} timezone={timezone} mail={mail} />
          )}
          {section === "prices" && <PricesSection pricing={pricing} methods={methods} timezone={timezone} />}
          {section === "delivery" && <DeliverySection mail={mail} />}
          {section === "history" && <HistorySection log={log} timezone={timezone} />}
        </div>
      </div>
    </Page>
  );
}
