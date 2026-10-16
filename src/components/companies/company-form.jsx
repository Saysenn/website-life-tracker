"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateField } from "@/components/ui/date-field";
import { Field, Input, Textarea } from "@/components/ui/field";
import { COMMON_CURRENCIES, DEFAULT_TLD, WEBSITE_TLDS } from "@/lib/constants";
import { formatMoney, formatUsdt, usdtOf } from "@/lib/money";
import { endFrom, SERVICES } from "@/lib/services";
import { cn } from "@/lib/utils";
import { companySchema, firstErrors } from "@/lib/validation";
import { replaceTld, suggestWebsite } from "@/lib/website";

const FIELDS = [
  "name",
  "website",
  "group",
  "paymentType",
  "paymentMethod",
  "currency",
  "digirdpEmail",
  "digirdpPassword",
  "domainStart",
  "domainEnd",
  "domainPrice",
  "domainCurrency",
  "hostingStart",
  "hostingEnd",
  "hostingPrice",
  "hostingCurrency",
  "rdpStart",
  "rdpRenewal",
  "rdpPrice",
  "rdpCurrency",
  "notes",
];

function initialValues(company, groupName, groups) {
  if (company) return Object.fromEntries(FIELDS.map((key) => [key, (key === "group" ? company.groupName : company[key]) ?? ""]));
  const values = Object.fromEntries(FIELDS.map((key) => [key, ""]));
  const group = groupName && groups.find((item) => item.name === groupName);
  if (group) {
    Object.assign(values, { group: group.name, paymentType: group.paymentType ?? "", paymentMethod: group.paymentMethod ?? "" });
  }
  return values;
}

function defaultPrice(pricing, service) {
  const fallback = pricing.prices[service.key]?.price;
  return typeof fallback === "number" ? String(fallback) : "35.81";
}

function priceHint(values, pricing, service) {
  const amount = Number(values[service.price]);
  const currency =
    values[service.currency] || values.currency || pricing.prices[service.key]?.currency || pricing.currency;
  if (values[service.price] !== "" && Number.isFinite(amount) && amount >= 0) {
    return `${formatMoney(amount, currency)} is ${formatUsdt(usdtOf({ amount, currency }, pricing.rates))}`;
  }
  const fallback = pricing.prices[service.key];
  return typeof fallback?.price === "number"
    ? `Leave empty to use the ${formatMoney(fallback.price, fallback.currency)} default`
    : "Leave empty to use the default from Settings";
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-semibold text-ink-2">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function CompanyForm({ company, options, pricing, today, defaultGroup, draft, onCancel, onSubmit }) {
  const [values, setValues] = useState(() => draft?.values ?? initialValues(company, defaultGroup, options.groups));
  const [errors, setErrors] = useState(() => draft?.errors ?? {});
  const [filledFrom, setFilledFrom] = useState(null);
  const currencyOptions = [...new Set([...COMMON_CURRENCIES, ...Object.keys(pricing.rates)])];
  const [websiteAuto, setWebsiteAuto] = useState(() => !(draft?.values.website || company?.website));
  const [tld, setTld] = useState(
    () => WEBSITE_TLDS.find((item) => (company?.website ?? "").endsWith(item)) ?? DEFAULT_TLD,
  );
  const formRef = useRef(null);

  function set(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (key === "paymentType" || key === "paymentMethod") setFilledFrom(null);
  }

  function setName(value) {
    set("name", value);
    if (websiteAuto) set("website", suggestWebsite(value, tld));
  }

  function setWebsite(value) {
    set("website", value);
    setWebsiteAuto(!value.trim());
  }

  function pickTld(next) {
    setTld(next);
    set("website", websiteAuto ? suggestWebsite(values.name, next) : replaceTld(values.website, next));
  }

  function setStart(service, value) {
    set(service.start, value);
    if (value) set(service.end, endFrom(service, value));
  }

  function selectGroup(name) {
    const group = options.groups.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const hasDefaults = Boolean(group?.paymentType || group?.paymentMethod);
    setValues((current) => ({
      ...current,
      group: name,
      ...(hasDefaults && {
        paymentType: group.paymentType ?? current.paymentType,
        paymentMethod: group.paymentMethod ?? current.paymentMethod,
      }),
    }));
    setFilledFrom(hasDefaults ? group.name : null);
  }

  function submit(event) {
    event.preventDefault();
    const parsed = companySchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstErrors(parsed.error));
      requestAnimationFrame(() => formRef.current?.querySelector("[aria-invalid='true'], [data-invalid='true']")?.focus());
      return;
    }
    onSubmit(values, parsed.data);
  }

  const invalid = (key) => (errors[key] ? true : undefined);
  const fromGroup = filledFrom && <span className="text-2xs text-data">From {filledFrom}</span>;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") formRef.current?.requestSubmit();
      }}
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex items-start gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-3">{company ? "Edit company" : "New company"}</p>
          <h2 className="mt-0.5 truncate text-lg font-semibold">{values.name.trim() || company?.name || "Untitled company"}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Close">
          <X />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pt-1 pb-6">
        <Section title="Company">
          <Field label="Company name" htmlFor="company-name" error={errors.name}>
            <Input
              id="company-name"
              value={values.name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={invalid("name")}
              placeholder="Acme Studio"
              autoFocus={!company}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Website"
            htmlFor="company-website"
            error={errors.website}
            hint={websiteAuto ? "Suggested from the company name" : undefined}
          >
            <div className="grid gap-1.5">
              <Input
                id="company-website"
                value={values.website}
                onChange={(event) => setWebsite(event.target.value)}
                aria-invalid={invalid("website")}
                placeholder="acme.co.uk"
                inputMode="url"
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-1">
                {WEBSITE_TLDS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => pickTld(item)}
                    className={cn(
                      "h-6 rounded-md px-1.5 text-2xs transition-colors",
                      values.website.endsWith(item) ? "bg-hover text-ink" : "bg-sunken text-ink-3 hover:text-ink",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </Field>
        </Section>

        <Section title="Group and payment">
          <Field label="Group" htmlFor="company-group" hint="Picking a group fills in its default payment" className="sm:col-span-2">
            <Combobox
              id="company-group"
              value={values.group}
              onChange={selectGroup}
              options={options.groups.map((group) => group.name)}
              placeholder="No group"
            />
          </Field>
          <Field label="Payment type" htmlFor="company-paymentType" aside={fromGroup}>
            <Combobox
              id="company-paymentType"
              value={values.paymentType}
              onChange={(value) => set("paymentType", value)}
              options={options.paymentTypes}
              placeholder="Select type"
            />
          </Field>
          <Field label="Payment method" htmlFor="company-paymentMethod" aside={fromGroup}>
            <Combobox
              id="company-paymentMethod"
              value={values.paymentMethod}
              onChange={(value) => set("paymentMethod", value)}
              options={options.paymentMethods}
              placeholder="Select method"
            />
          </Field>
          <Field
            label="Billing currency"
            htmlFor="company-currency"
            error={errors.currency}
            hint="What this company is invoiced in"
          >
            <Combobox
              id="company-currency"
              value={values.currency}
              onChange={(value) => set("currency", value)}
              options={currencyOptions}
              placeholder={pricing.currency}
            />
          </Field>
        </Section>

        {SERVICES.map((service) => (
          <Section key={service.key} title={service.label}>
            {service.key === "rdp" && (
              <Field label="DigiRDP account email" htmlFor="company-digirdpEmail" error={errors.digirdpEmail} className="sm:col-span-2">
                <Input
                  id="company-digirdpEmail"
                  type="email"
                  value={values.digirdpEmail}
                  onChange={(event) => set("digirdpEmail", event.target.value)}
                  aria-invalid={invalid("digirdpEmail")}
                  placeholder="account@email.com"
                  autoComplete="off"
                />
              </Field>
            )}
            {service.key === "rdp" && (
              <Field
                label="DigiRDP password"
                htmlFor="company-digirdpPassword"
                error={errors.digirdpPassword}
                className="sm:col-span-2"
                hint={company?.hasPassword ? "A password is saved. Leave empty to keep it." : "Stored encrypted, copied in one click"}
              >
                <Input
                  id="company-digirdpPassword"
                  type="password"
                  value={values.digirdpPassword}
                  onChange={(event) => set("digirdpPassword", event.target.value)}
                  aria-invalid={invalid("digirdpPassword")}
                  placeholder={company?.hasPassword ? "Saved" : "Not set"}
                  autoComplete="new-password"
                />
              </Field>
            )}
            <Field label="Start date" htmlFor={`company-${service.start}`} error={errors[service.start]}>
              <DateField
                id={`company-${service.start}`}
                value={values[service.start]}
                onChange={(value) => setStart(service, value)}
                invalid={invalid(service.start)}
                today={today}
              />
            </Field>
            <Field
              label={service.endLabel}
              htmlFor={`company-${service.end}`}
              error={errors[service.end]}
              hint={`Fills in ${service.term} after the start date`}
            >
              <DateField
                id={`company-${service.end}`}
                value={values[service.end]}
                onChange={(value) => set(service.end, value)}
                invalid={invalid(service.end)}
                today={today}
              />
            </Field>
            <Field
              label={`Renewal price ${service.cycle}`}
              htmlFor={`company-${service.price}`}
              error={errors[service.price]}
              hint={priceHint(values, pricing, service)}
              className={cn("sm:col-span-2", !service.billable && "hidden")}
            >
              <div className="flex gap-2">
                <Input
                  id={`company-${service.price}`}
                  value={values[service.price]}
                  onChange={(event) => set(service.price, event.target.value)}
                  aria-invalid={invalid(service.price)}
                  placeholder={defaultPrice(pricing, service)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="max-w-[18rem]"
                />
                <Combobox
                  id={`company-${service.currency}`}
                  value={values[service.currency]}
                  onChange={(value) => set(service.currency, value)}
                  options={currencyOptions}
                  placeholder={values.currency || pricing.prices[service.key]?.currency || pricing.currency}
                  className="max-w-[12rem]"
                />
              </div>
            </Field>
          </Section>
        ))}

        <Section title="Notes">
          <Field label="Notes" htmlFor="company-notes" error={errors.notes} className="sm:col-span-2">
            <Textarea
              id="company-notes"
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              aria-invalid={invalid("notes")}
              placeholder="Anything worth remembering"
              rows={3}
            />
          </Field>
        </Section>
      </div>

      <footer className="flex items-center justify-end gap-2 px-5 py-3.5 shadow-[0_-10px_24px_rgb(64_48_26/0.05)]">
        <span className="mr-auto hidden text-2xs text-ink-4 lg:block">⌘ Enter to save</span>
        <Button variant="soft" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{company ? "Save changes" : "Add company"}</Button>
      </footer>
    </form>
  );
}
