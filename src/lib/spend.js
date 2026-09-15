import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import { shiftMonths, toISODate } from "./dates";
import { addPrice, priceOf, usdtOf } from "./money";
import { BILLABLE, SERVICES } from "./services";

const monthKey = (value) => value.slice(0, 7);

const labelsOf = (date) => ({
  key: format(date, "yyyy-MM"),
  label: format(date, "MMM"),
  full: format(date, "MMMM yyyy"),
});

function emptyBucket(date) {
  return {
    ...labelsOf(date),
    dueUsdt: 0,
    dueTotals: {},
    dueCount: 0,
    paidUsdt: 0,
    paidTotals: {},
    paidCount: 0,
    byGroup: {},
    paidByGroup: {},
  };
}

function dueDates(end, service, today, windowEnd) {
  const dates = [];
  let cursor = end;
  if (cursor < today) {
    dates.push(today);
    while (cursor < today) cursor = shiftMonths(cursor, service.months);
  }
  while (cursor <= windowEnd) {
    dates.push(cursor);
    cursor = shiftMonths(cursor, service.months);
  }
  return dates;
}

export function buildSpend(companies, pricing, today, months) {
  const first = startOfMonth(parseISO(today));
  const buckets = Array.from({ length: months }, (_, index) => emptyBucket(addMonths(first, index)));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const windowEnd = toISODate(addMonths(first, months));
  const currentKey = buckets[0].key;
  let withoutPrice = 0;

  for (const company of companies) {
    const group = company.groupName ?? "No group";

    for (const service of BILLABLE) {
      if (company[service.closed]) continue;
      const price = priceOf(company, service, pricing);
      const start = company[service.start];
      const end = company[service.end];
      if (!price) {
        if (start || end) withoutPrice += 1;
        continue;
      }
      const usdt = usdtOf(price, pricing.rates);

      if (start && start <= today && monthKey(start) === currentKey) {
        const bucket = byKey.get(currentKey);
        bucket.paidUsdt += usdt;
        bucket.paidCount += 1;
        addPrice(bucket.paidTotals, price);
        const groupBucket = (bucket.paidByGroup[group] ??= { usdt: 0, totals: {}, count: 0 });
        groupBucket.usdt += usdt;
        groupBucket.count += 1;
        addPrice(groupBucket.totals, price);
      }

      if (!end) continue;
      for (const date of dueDates(end, service, today, windowEnd)) {
        const bucket = byKey.get(monthKey(date));
        if (!bucket) continue;
        bucket.dueUsdt += usdt;
        bucket.dueCount += 1;
        addPrice(bucket.dueTotals, price);
        const groupBucket = (bucket.byGroup[group] ??= { usdt: 0, totals: {}, count: 0 });
        groupBucket.usdt += usdt;
        groupBucket.count += 1;
        addPrice(groupBucket.totals, price);
      }
    }
  }

  return { months: buckets, withoutPrice };
}

export function buildRenewals(companies, today, months) {
  const first = startOfMonth(parseISO(today));
  const buckets = Array.from({ length: months }, (_, index) => ({
    ...labelsOf(addMonths(first, index)),
    count: 0,
    byGroup: {},
  }));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const windowEnd = toISODate(addMonths(first, months));

  for (const company of companies) {
    const group = company.groupName ?? "No group";

    for (const service of SERVICES) {
      const end = company[service.end];
      if (company[service.closed] || !end) continue;

      for (const date of dueDates(end, service, today, windowEnd)) {
        const bucket = byKey.get(monthKey(date));
        if (!bucket) continue;
        bucket.count += 1;
        const entry = (bucket.byGroup[group] ??= { count: 0, services: {} });
        entry.count += 1;
        entry.services[service.label] = (entry.services[service.label] ?? 0) + 1;
      }
    }
  }

  return buckets;
}
