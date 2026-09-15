import { CircleCheck, Plus } from "lucide-react";
import Link from "next/link";
import { GroupDonut } from "@/components/dashboard/group-donut";
import { RenewalsLine } from "@/components/dashboard/renewals-line";
import { SpendBars } from "@/components/dashboard/spend-bars";
import { StatTile } from "@/components/dashboard/stat-tile";
import { buttonClass } from "@/components/ui/button";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { getCompanies, getGroups, getPricing, getStatusRules, getToday } from "@/lib/data";
import { formatDate, relativeDays } from "@/lib/dates";
import { formatTotals, formatUsdt } from "@/lib/money";
import { isArchived, needsAttention, openStates, STATUSES } from "@/lib/services";
import { buildRenewals, buildSpend } from "@/lib/spend";
import { cn, plural } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

const ATTENTION_ORDER = ["rebuy", "suspended", "ended", "renewal"];
const dueTones = { rebuy: "text-danger", suspended: "text-serious", ended: "text-danger", renewal: "text-warning" };

function groupRows(source) {
  return Object.entries(source)
    .sort((a, b) => b[1].usdt - a[1].usdt)
    .map(([name, entry]) => ({
      key: name,
      label: name,
      value: formatUsdt(entry.usdt),
      hint: plural(entry.count, "renewal"),
    }));
}

function attentionRows(states) {
  const groups = {};
  for (const state of states) {
    const name = state.company.groupName ?? "No group";
    const entry = (groups[name] ??= { count: 0, status: state.status, services: new Set() });
    entry.count += 1;
    entry.services.add(state.service.label);
  }
  return Object.entries(groups)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, entry]) => ({
      key: name,
      label: name,
      value: entry.count,
      hint: [...entry.services].join(" · "),
      status: entry.status,
    }));
}


export default async function DashboardPage() {
  const [companies, groups, rules, pricing] = await Promise.all([
    getCompanies(),
    getGroups(),
    getStatusRules(),
    getPricing(),
  ]);

  const today = getToday();
  const open = companies.filter((company) => !isArchived(company));
  const states = open.flatMap((company) => openStates(company, today, rules).map((state) => ({ ...state, company })));
  const spend = buildSpend(open, pricing, today, 6);
  const current = spend.months[0];

  const attention = states.filter(needsAttention).sort((a, b) => a.days - b.days);
  const attentionHint = ATTENTION_ORDER.filter((status) => attention.some((state) => state.status === status))
    .map((status) => `${attention.filter((state) => state.status === status).length} ${STATUSES[status].toLowerCase()}`)
    .join(" · ");

  const slices = Object.entries(current.byGroup)
    .map(([name, entry]) => ({ name, value: entry.usdt }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);

  const renewals = buildRenewals(open, today, 6);

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        description={formatDate(today, "EEEE, d MMMM yyyy")}
        actions={
          <Link href="/companies?new=1" className={buttonClass()}>
            <Plus /> New company
          </Link>
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StatTile
          accent
          label="Still to pay this month"
          value={formatUsdt(current.dueUsdt)}
          hint={`${formatTotals(current.dueTotals, pricing.currency)} · ${plural(current.dueCount, "renewal")}`}
          amountLabel="To send"
          rows={groupRows(current.byGroup)}
          empty="Nothing left to pay this month."
        />
        <StatTile
          label="Paid this month"
          value={formatUsdt(current.paidUsdt)}
          hint={`${formatTotals(current.paidTotals, pricing.currency)} · ${plural(current.paidCount, "renewal")}`}
          amountLabel="Paid"
          rows={groupRows(current.paidByGroup)}
          empty="No renewals paid yet this month."
        />
        <StatTile
          label="Needs action"
          status={attention[0]?.status ?? "active"}
          value={attention.length}
          hint={attentionHint || "Everything is on track"}
          amountLabel="Services"
          rows={attentionRows(attention)}
          empty="Everything is on track."
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Spend by month" description="RDP renewals in USDT" className="lg:col-span-3 animate-rise">
          <SpendBars months={spend.months} currency={pricing.currency} />
        </Card>

        <Card title="This month by group" description="Where the spend sits" className="lg:col-span-2 animate-rise">
          <div className="flex h-full items-center">
            {slices.length ? (
              <GroupDonut slices={slices} />
            ) : (
              <p className="w-full py-10 text-center text-sm text-ink-3">Nothing to pay this month.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Needs attention" description="The most urgent renewals first" className="lg:col-span-3 animate-rise">
          {attention.length ? (
            <ul className="-mx-2 grid">
              {attention.slice(0, 7).map((state) => (
                <li key={`${state.company.id}-${state.service.key}`}>
                  <Link
                    href={`/companies?id=${state.company.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{state.company.name}</p>
                      <p className="truncate text-xs text-ink-3">
                        {state.service.label}
                        {state.company.website && ` · ${state.company.website}`}
                      </p>
                    </div>
                    <StatusBadge status={state.status} className="hidden sm:inline-flex" />
                    <div className="w-[11rem] shrink-0 text-right">
                      <p className="text-sm text-ink-2 tabular-nums">{formatDate(state.end, "d MMM yyyy")}</p>
                      <p className={cn("text-xs", dueTones[state.status] ?? "text-ink-3")}>{relativeDays(state.days)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <CircleCheck className="size-[2.2rem] text-success" strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium">All clear</p>
              <p className="mt-0.5 text-xs text-ink-3">Nothing needs renewing right now.</p>
            </div>
          )}
        </Card>

        <Card title="Renewals ahead" description="Every service, next 6 months" className="lg:col-span-2 animate-rise">
          <div className="flex h-full items-center">
            <div className="w-full">
              <RenewalsLine points={renewals} />
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
