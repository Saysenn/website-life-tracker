import { CompaniesView } from "@/components/companies/companies-view";
import { getCompanies, getGroups, getNameHistory, getPricing, getStatusRules, getToday, TIMEZONE } from "@/lib/data";

export const metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const [companies, groups, nameHistory, rules, pricing] = await Promise.all([
    getCompanies(),
    getGroups(),
    getNameHistory(),
    getStatusRules(),
    getPricing(),
  ]);
  return (
    <CompaniesView
      companies={companies}
      groups={groups}
      nameHistory={nameHistory}
      rules={rules}
      pricing={pricing}
      today={getToday()}
      timezone={TIMEZONE}
    />
  );
}
