import { addPrice, gasFeeOf, mergeTotals, priceOf, usdtOf } from "./money";
import { BILLABLE, isArchived, serviceState } from "./services";

const monthKey = (value) => value.slice(0, 7);

export function buildGroupPanels(companies, groups, pricing, rules, today) {
  const service = BILLABLE[0];

  return groups.map((group) => {
    const rows = companies
      .filter((company) => !isArchived(company) && company.groupId === group.id && !company[service.closed])
      .map((company) => {
        const state = serviceState(company, service, today, rules);
        const price = priceOf(company, service, pricing);
        return {
          id: company.id,
          name: company.name,
          hasPassword: company.hasPassword,
          account: company.digirdpEmail || company.website || "",
          network: company.paymentMethod || "Not set",
          start: state.start,
          end: state.end,
          days: state.days,
          status: state.status,
          price,
          usdt: usdtOf(price, pricing.rates),
          gas: gasFeeOf(company, pricing),
        };
      })
      .sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER));

    return { id: group.id, name: group.name, rows };
  });
}

export function panelTotals(rows, today) {
  const current = monthKey(today);

  const totals = rows.reduce(
    (totals, row) => {
      if (!row.price) return totals;

      if (row.start && row.start <= today && monthKey(row.start) === current) {
        totals.paid += row.usdt;
        totals.paidCount += 1;
        addPrice(totals.paidRaw, row.price);
      }

      if (row.end && (monthKey(row.end) === current || row.end < today)) {
        totals.due += row.usdt;
        totals.dueCount += 1;
        addPrice(totals.dueRaw, row.price);

        const gas = (totals.gas[row.network] ??= { amount: 0, currency: row.gas?.currency ?? null, transfers: 0 });
        gas.transfers += 1;
        if (row.gas) {
          gas.amount += row.gas.amount;
          gas.currency = row.gas.currency;
        }
      }
      return totals;
    },
    { paid: 0, paidRaw: {}, paidCount: 0, due: 0, dueRaw: {}, dueCount: 0, gas: {} },
  );

  return {
    ...totals,
    usdt: totals.paid + totals.due,
    raw: mergeTotals({ ...totals.paidRaw }, totals.dueRaw),
    count: totals.paidCount + totals.dueCount,
  };
}
