import { formatDate, relativeDays } from "./dates";
import { formatMoney, priceOf } from "./money";
import { isArchived, SERVICES, serviceState, STATUSES } from "./services";

export const NO_GROUP = 0;

export const EXPORT_COLORS = {
  sand: { label: "Sand", fill: "F3EEE6", accent: "8C6C46" },
  sky: { label: "Sky", fill: "E4EDF4", accent: "2F6F9F" },
  sage: { label: "Sage", fill: "E3ECDD", accent: "3F6F47" },
  lilac: { label: "Lilac", fill: "ECE7F3", accent: "684F94" },
  amber: { label: "Amber", fill: "F6EAD0", accent: "97620D" },
  rose: { label: "Rose", fill: "F7E4DC", accent: "A63F2A" },
  slate: { label: "Slate", fill: "E8EAED", accent: "4A5563" },
};

export const STATUS_COLORS = {
  active: "3F6F47",
  renewed: "3F6F47",
  renewal: "97620D",
  suspended: "A9552A",
  rebuy: "A63F2A",
  ended: "A63F2A",
  upcoming: "2F6F9F",
  unset: "8C8274",
  closed: "8C8274",
};

const serviceColumns = (service) => [
  { key: `${service.key}Start`, label: "Start", type: "date", width: 13 },
  { key: `${service.key}End`, label: service.key === "rdp" ? "Renewal" : "End", type: "date", width: 13 },
  { key: `${service.key}Life`, label: "Life left", width: 15 },
  { key: `${service.key}Status`, label: "Status", type: "status", width: 12 },
  ...(service.billable ? [{ key: `${service.key}Price`, label: "Price", width: 12 }] : []),
];

export const EXPORT_SECTIONS = [
  {
    key: "company",
    label: "Company",
    color: "sand",
    columns: [
      { key: "name", label: "Company", width: 26 },
      { key: "website", label: "Website", width: 24 },
      { key: "group", label: "Group", width: 16 },
      { key: "paymentMethod", label: "Payment method", width: 16 },
      { key: "paymentType", label: "Payment type", width: 14 },
    ],
  },
  ...SERVICES.map((service, index) => ({
    key: service.key,
    label: service.label,
    color: ["sky", "sage", "lilac"][index],
    columns: serviceColumns(service),
  })),
  {
    key: "access",
    label: "Credentials",
    color: "amber",
    columns: [
      { key: "providerEmail", label: "Provider email", width: 28 },
      { key: "providerPassword", label: "Provider password", type: "secret", width: 20 },
      { key: "rdpKey", label: "RDP key", type: "secret", width: 22 },
    ],
  },
  { key: "notes", label: "Notes", color: "slate", columns: [{ key: "notes", label: "Notes", width: 36 }] },
];

export const DEFAULT_EXPORT_COLUMNS = EXPORT_SECTIONS.flatMap((section) =>
  section.columns.filter((column) => !["group", "paymentType", "notes"].includes(column.key)).map((column) => column.key),
);

export const DEFAULT_EXPORT_COLORS = Object.fromEntries(EXPORT_SECTIONS.map((section) => [section.key, section.color]));

function lifeLeft(state) {
  if (state.status === "closed") return "Closed";
  if (state.status === "upcoming") return "Not started";
  return relativeDays(state.days);
}

export function exportRow(company, secrets, pricing, rules, today) {
  const row = {
    name: company.name,
    website: company.website ?? "",
    group: company.groupName ?? "No group",
    paymentMethod: company.paymentMethod ?? "",
    paymentType: company.paymentType ?? "",
    providerEmail: company.digirdpEmail ?? "",
    providerPassword: secrets.providerPassword,
    rdpKey: secrets.rdpKey,
    notes: company.notes ?? "",
  };

  for (const service of SERVICES) {
    const state = serviceState(company, service, today, rules);
    row[`${service.key}Start`] = state.start ?? "";
    row[`${service.key}End`] = state.end ?? "";
    row[`${service.key}Life`] = lifeLeft(state);
    row[`${service.key}Status`] = { key: state.status, label: STATUSES[state.status] };
    if (service.billable) {
      const price = priceOf(company, service, pricing);
      row[`${service.key}Price`] = price ? formatMoney(price.amount, price.currency) : "";
    }
  }
  return row;
}

export function groupForExport(companies, groups, { groupIds, includeArchived }) {
  const wanted = new Set(groupIds);
  const buckets = [...groups.map((group) => ({ id: group.id, name: group.name })), { id: NO_GROUP, name: "No group" }]
    .filter((group) => wanted.has(group.id))
    .map((group) => ({
      ...group,
      companies: companies.filter(
        (company) => (company.groupId ?? NO_GROUP) === group.id && (includeArchived || !isArchived(company)),
      ),
    }));
  return buckets.filter((group) => group.companies.length);
}

export function pickColumns(keys) {
  const wanted = new Set(keys);
  return EXPORT_SECTIONS.map((section) => ({
    ...section,
    columns: section.columns.filter((column) => wanted.has(column.key)),
  })).filter((section) => section.columns.length);
}

export function cellText(column, value) {
  if (column.type === "status") return value?.label ?? "";
  if (column.type === "date") return value ? formatDate(value) : "";
  return value ?? "";
}

export const exportStamp = (today) => formatDate(today);
