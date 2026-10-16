import { z } from "zod";
import { isISODate } from "./dates";
import { endFrom, SERVICES } from "./services";

const text = (max) => z.string().trim().max(max, `Keep it under ${max} characters`);
const optionalText = (max) => text(max).transform((value) => value || null);

const optionalDate = z
  .string()
  .trim()
  .refine((value) => !value || isISODate(value), "Pick a valid date")
  .transform((value) => value || null);

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid email")
  .transform((value) => value.toLowerCase() || null);

const website = text(200).transform(
  (value) =>
    value
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase() || null,
);

export const idSchema = z.number().int().positive();

const optionalPrice = z
  .union([z.string(), z.number(), z.null()])
  .transform((value) => {
    if (value === null || value === "") return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : NaN;
  })
  .refine((value) => value === null || (Number.isFinite(value) && value >= 0), "Enter a price like 35.81");

const currencyCode = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), "Use a 3 letter code like GBP");

const optionalCurrency = z
  .string()
  .transform((value) => value.trim().toUpperCase() || null)
  .refine((value) => value === null || /^[A-Z]{3}$/.test(value), "Use a 3 letter code like GBP");

export const accountRowSchema = z.object({
  id: idSchema.nullable().optional(),
  name: text(120).min(1, "Company name is required"),
  group: optionalText(60),
  account: optionalEmail,
  password: optionalText(200),
});

export const companySchema = z
  .object({
    name: text(120).min(1, "Company name is required"),
    website,
    group: optionalText(60),
    paymentType: optionalText(60),
    paymentMethod: optionalText(60),
    currency: optionalCurrency,
    digirdpEmail: optionalEmail,
    digirdpPassword: optionalText(200),
    domainStart: optionalDate,
    domainEnd: optionalDate,
    domainPrice: optionalPrice,
    domainCurrency: optionalCurrency,
    hostingStart: optionalDate,
    hostingEnd: optionalDate,
    hostingPrice: optionalPrice,
    hostingCurrency: optionalCurrency,
    rdpStart: optionalDate,
    rdpRenewal: optionalDate,
    rdpPrice: optionalPrice,
    rdpCurrency: optionalCurrency,
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    for (const service of SERVICES) {
      const start = value[service.start];
      const end = value[service.end];
      if (start && end && end < start) {
        ctx.addIssue({ code: "custom", path: [service.end], message: "Must be after the start date" });
      }
    }
  })
  .transform((value) => {
    for (const service of SERVICES) {
      if (value[service.start] && !value[service.end]) value[service.end] = endFrom(service, value[service.start]);
    }
    return value;
  });

export const groupSchema = z.object({
  name: text(60).min(1, "Group name is required"),
  paymentType: optionalText(60),
  paymentMethod: optionalText(60),
  applyToCompanies: z.boolean().optional(),
});

export const settingsSchema = z.object({
  notifyEmail: optionalEmail,
  reminderDays: z.array(z.number().int().min(0).max(365)).max(12),
  remindersEnabled: z.boolean(),
  graceDays: z.number().int().min(0).max(60),
});

export const pricesSchema = z.object({
  currency: currencyCode,
  services: z.record(
    z.string(),
    z.object({ provider: optionalText(60), price: optionalPrice, currency: currencyCode }),
  ),
  rates: z.record(
    z.string(),
    z
      .union([z.string(), z.number()])
      .transform(Number)
      .refine((value) => Number.isFinite(value) && value > 0, "Enter a rate like 1.35"),
  ),
  gasCurrency: currencyCode,
  gasFees: z.record(
    z.string(),
    z
      .union([z.string(), z.number(), z.null()])
      .transform((value) => (value === null || value === "" ? 0 : Number(value)))
      .refine((value) => Number.isFinite(value) && value >= 0, "Enter a fee like 1.50"),
  ),
});

export function firstErrors(error) {
  const errors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
