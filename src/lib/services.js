import { DEFAULT_GRACE_DAYS } from "./constants";
import { daysUntil, shiftMonths } from "./dates";

export const SERVICES = [
  {
    key: "domain",
    label: "Domain",
    start: "domainStart",
    end: "domainEnd",
    closed: "domainClosedAt",
    price: "domainPrice",
    currency: "domainCurrency",
    endLabel: "End date",
    months: 12,
    term: "1 year",
    cycle: "per year",
    suspends: false,
    billable: false,
  },
  {
    key: "hosting",
    label: "Hosting",
    start: "hostingStart",
    end: "hostingEnd",
    closed: "hostingClosedAt",
    price: "hostingPrice",
    currency: "hostingCurrency",
    endLabel: "End date",
    months: 12,
    term: "1 year",
    cycle: "per year",
    suspends: false,
    billable: false,
  },
  {
    key: "rdp",
    label: "RDP",
    start: "rdpStart",
    end: "rdpRenewal",
    closed: "rdpClosedAt",
    price: "rdpPrice",
    currency: "rdpCurrency",
    endLabel: "Renewal date",
    months: 1,
    term: "1 month",
    cycle: "per month",
    suspends: true,
    billable: true,
  },
];

export const BILLABLE = SERVICES.filter((service) => service.billable);

export const DEFAULT_RULES = { window: 1, grace: DEFAULT_GRACE_DAYS };

export const SERVICE_BY_KEY = Object.fromEntries(SERVICES.map((service) => [service.key, service]));

export const endFrom = (service, start) => shiftMonths(start, service.months);

export const STATUSES = {
  active: "Active",
  renewed: "Renewed",
  renewal: "Renewal",
  suspended: "Suspended",
  rebuy: "Rebuy",
  ended: "Ended",
  upcoming: "Not started",
  unset: "Not set",
  closed: "Closed",
};

function statusOf({ start, days, today, closedAt, service, rules }) {
  if (closedAt) return "closed";
  if (!start && days === null) return "unset";
  if (start && start > today) return "upcoming";
  if (days === null) return "active";
  if (start === today) return "renewed";
  if (days > rules.window) return "active";
  if (days >= 0) return "renewal";
  if (!service.suspends) return "ended";
  return days >= -rules.grace ? "suspended" : "rebuy";
}

export function serviceState(company, service, today, rules = DEFAULT_RULES) {
  const start = company[service.start];
  const end = company[service.end];
  const closedAt = company[service.closed];
  const days = end ? daysUntil(end, today) : null;
  return { service, start, end, days, closedAt, status: statusOf({ start, days, today, closedAt, service, rules }) };
}

export function serviceStates(company, today, rules) {
  return SERVICES.map((service) => serviceState(company, service, today, rules));
}

export function openStates(company, today, rules) {
  return serviceStates(company, today, rules).filter((state) => state.status !== "closed");
}

export const isArchived = (company) => SERVICES.every((service) => company[service.closed]);

const ATTENTION = ["renewal", "suspended", "rebuy", "ended"];

export function needsAttention(state) {
  return ATTENTION.includes(state.status);
}

export function matchesStatus(state, filter) {
  if (filter === "all") return true;
  if (filter === "active") return state.status === "active" || state.status === "renewed";
  return state.status === filter;
}
