import { AppShell } from "@/components/shell/app-shell";
import { getCompanies, getGroups, getPricing, getStatusRules, getToday } from "@/lib/data";
import { buildGroupPanels } from "@/lib/group-panel";
import { isArchived, needsAttention, serviceStates } from "@/lib/services";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  await requireSession();
  const [companies, groups, rules, pricing] = await Promise.all([
    getCompanies(),
    getGroups(),
    getStatusRules(),
    getPricing(),
  ]);
  const today = getToday();

  const alerts = companies
    .flatMap((company) =>
      serviceStates(company, today, rules)
        .filter(needsAttention)
        .map(({ service, end, days, status }) => ({
          id: `${company.id}-${service.key}`,
          companyId: company.id,
          groupId: company.groupId,
          company: company.name,
          service: service.label,
          date: end,
          days,
          status,
        })),
    )
    .sort((a, b) => a.days - b.days);

  const groupLinks = groups.map((group) => ({
    id: group.id,
    name: group.name,
    count: companies.filter((company) => company.groupId === group.id && !isArchived(company)).length,
    attention: alerts.some((alert) => alert.groupId === group.id),
  }));

  return (
    <AppShell
      groups={groupLinks}
      alerts={alerts}
      panels={buildGroupPanels(companies, groups, pricing, rules, today)}
      today={today}
      currency={pricing.currency}
    >
      {children}
    </AppShell>
  );
}
