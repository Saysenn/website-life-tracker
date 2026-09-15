import "server-only";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { RATES_ENDPOINT } from "./constants";
import { getCompanies, getPricing } from "./data";
import { utcStamp } from "./dates";
import { currenciesInUse } from "./money";

export async function fetchRates(currencies) {
  const response = await fetch(RATES_ENDPOINT, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("RATES_UNAVAILABLE");

  const data = await response.json();
  if (data?.result !== "success" || !data?.rates) throw new Error("RATES_UNAVAILABLE");

  const rates = {};
  for (const currency of currencies) {
    const upper = currency.toUpperCase();
    if (upper === "USD" || upper === "USDT") {
      rates[upper] = 1;
      continue;
    }
    const perUsd = data.rates[upper];
    if (typeof perUsd === "number" && perUsd > 0) rates[upper] = Number((1 / perUsd).toFixed(4));
  }

  if (!Object.keys(rates).length) throw new Error("RATES_UNAVAILABLE");
  return rates;
}

export async function updateRates() {
  const [companies, pricing] = await Promise.all([getCompanies(), getPricing()]);
  const fetched = await fetchRates(currenciesInUse(companies, pricing));
  const rates = { ...pricing.rates, ...fetched };
  const ratesUpdatedAt = utcStamp();

  await db
    .insert(settings)
    .values({ id: 1, rates, ratesUpdatedAt })
    .onConflictDoUpdate({ target: settings.id, set: { rates, ratesUpdatedAt } });
  return { rates, ratesUpdatedAt };
}
