import { addDays, parseISO } from "date-fns";
import { daysUntil, toISODate } from "./dates";
import { gasFeeOf, priceOf, usdtOf } from "./money";
import { BILLABLE, serviceState } from "./services";

export function buildPreviewItems(companies, pricing, rules, today, maxDays) {
  const until = toISODate(addDays(parseISO(today), maxDays));

  return companies
    .flatMap((company) =>
      BILLABLE.flatMap((service) => {
        if (company[service.closed]) return [];
        const end = company[service.end];
        if (!end || end > until) return [];
        const start = company[service.start] ?? null;
        const price = priceOf(company, service, pricing);
        const gas = gasFeeOf(company, pricing);

        return [
          {
            id: `${company.id}-${service.key}`,
            companyId: company.id,
            company: company.name,
            website: company.website,
            account: company.digirdpEmail,
            hasPassword: company.hasPassword,
            group: company.groupName ?? "No group",
            service: service.key,
            serviceLabel: service.label,
            paymentMethod: company.paymentMethod,
            start,
            end,
            days: daysUntil(end, today),
            status: serviceState(company, service, today, rules).status,
            price,
            usdt: usdtOf(price, pricing.rates),
            gas,
            gasUsdt: usdtOf(gas, pricing.rates),
          },
        ];
      }),
    )
    .sort((a, b) => a.days - b.days || a.company.localeCompare(b.company));
}

export function totalsOf(items) {
  return items.reduce(
    (totals, item) => {
      totals.count += 1;
      if (!item.price) {
        totals.withoutPrice += 1;
        return totals;
      }
      totals.raw[item.price.currency] = (totals.raw[item.price.currency] ?? 0) + item.price.amount;
      totals.usdt += item.usdt;
      totals.transfers += 1;

      const network = item.paymentMethod || "Not set";
      const gas = (totals.gas[network] ??= { amount: 0, currency: item.gas?.currency ?? null, transfers: 0 });
      gas.transfers += 1;
      if (item.gas) {
        gas.amount += item.gas.amount;
        gas.currency = item.gas.currency;
      }
      return totals;
    },
    { raw: {}, usdt: 0, gas: {}, count: 0, transfers: 0, withoutPrice: 0 },
  );
}
