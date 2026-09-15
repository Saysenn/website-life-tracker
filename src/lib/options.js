import { DEFAULT_PAYMENT_METHODS, DEFAULT_PAYMENT_TYPES } from "./constants";

function unique(values) {
  const seen = new Map();
  for (const value of values) {
    const key = value?.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, value.trim());
  }
  return [...seen.values()];
}

export function paymentOptions(companies, groups) {
  const rows = [...groups, ...companies];
  return {
    paymentTypes: unique([...DEFAULT_PAYMENT_TYPES, ...rows.map((row) => row.paymentType)]),
    paymentMethods: unique([...DEFAULT_PAYMENT_METHODS, ...rows.map((row) => row.paymentMethod)]),
  };
}
