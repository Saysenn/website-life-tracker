import { DEFAULT_CURRENCY } from "./constants";
import { BILLABLE, SERVICES } from "./services";

const code = (value, fallback = DEFAULT_CURRENCY) => (value || fallback).toUpperCase();

export function normalizeRates(raw, legacyRate, legacyCurrency) {
  const rates = { USD: 1, USDT: 1 };
  if (raw && typeof raw === "object") {
    for (const [currency, value] of Object.entries(raw)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) rates[code(currency)] = value;
    }
  }
  if (typeof legacyRate === "number" && legacyRate > 0 && legacyCurrency && !rates[code(legacyCurrency)]) {
    rates[code(legacyCurrency)] = legacyRate;
  }
  return rates;
}

export function normalizePrices(raw, fallbackCurrency) {
  const prices = {};
  for (const service of BILLABLE) {
    const entry = raw?.[service.key] ?? {};
    prices[service.key] = {
      provider: typeof entry.provider === "string" ? entry.provider : "",
      price: typeof entry.price === "number" && Number.isFinite(entry.price) ? entry.price : null,
      currency: code(entry.currency, fallbackCurrency),
    };
  }
  return prices;
}

export function normalizeGasFees(raw) {
  const fees = {};
  if (raw && typeof raw === "object") {
    for (const [method, value] of Object.entries(raw)) {
      const fee = Number(value);
      if (method && Number.isFinite(fee) && fee >= 0) fees[method] = fee;
    }
  }
  return fees;
}

export function normalizePricing(settings) {
  const currency = code(settings?.currency);
  return {
    currency,
    rates: normalizeRates(settings?.rates, settings?.usdtRate, currency),
    ratesUpdatedAt: settings?.ratesUpdatedAt ?? null,
    prices: normalizePrices(settings?.servicePrices, currency),
    gasFees: normalizeGasFees(settings?.gasFees),
    gasCurrency: code(settings?.gasCurrency, currency),
  };
}

export function gasFeeOf(company, pricing) {
  const fee = company.paymentMethod ? pricing.gasFees?.[company.paymentMethod] : null;
  return typeof fee === "number" && fee > 0 ? { amount: fee, currency: pricing.gasCurrency } : null;
}

export function priceOf(company, service, pricing) {
  if (!service.billable) return null;
  const own = company[service.price];
  const currency = company[service.currency] || company.currency;
  if (typeof own === "number" && Number.isFinite(own)) {
    return { amount: own, currency: code(currency, pricing.currency) };
  }
  const fallback = pricing.prices[service.key];
  if (typeof fallback?.price !== "number") return null;
  return { amount: fallback.price, currency: code(currency || fallback.currency, pricing.currency) };
}

export const rateOf = (currency, rates) => rates[code(currency)] ?? null;

export function usdtOf(price, rates) {
  if (!price) return 0;
  const rate = rateOf(price.currency, rates);
  return rate === null ? 0 : Math.round(price.amount * rate * 100) / 100;
}

export function addPrice(totals, price) {
  if (price) totals[price.currency] = (totals[price.currency] ?? 0) + price.amount;
  return totals;
}

export function mergeTotals(target, source) {
  for (const [currency, amount] of Object.entries(source)) target[currency] = (target[currency] ?? 0) + amount;
  return target;
}

export function formatMoney(amount, currency = DEFAULT_CURRENCY) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code(currency),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code(currency)}`;
  }
}

export const formatAmount = (amount) =>
  new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

export const formatUsdt = (amount) => `${formatAmount(amount)} USDT`;

export function formatTotals(totals, fallbackCurrency = DEFAULT_CURRENCY) {
  const parts = Object.entries(totals)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => formatMoney(amount, currency));
  return parts.length ? parts.join(" + ") : formatMoney(0, fallbackCurrency);
}

export function currenciesInUse(companies, pricing) {
  const used = new Set([pricing.currency, pricing.gasCurrency].filter(Boolean));
  for (const company of companies) if (company.currency) used.add(code(company.currency));
  for (const service of BILLABLE) {
    used.add(code(pricing.prices[service.key]?.currency, pricing.currency));
    for (const company of companies) if (company[service.currency]) used.add(code(company[service.currency]));
  }
  return [...used];
}

export function missingPrices(companies, service, pricing) {
  return companies.filter((company) => priceOf(company, service, pricing) === null).length;
}
