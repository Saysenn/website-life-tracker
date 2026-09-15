import { PreviewView } from "@/components/preview/preview-view";
import { getCompanies, getPricing, getStatusRules, getToday } from "@/lib/data";
import { buildPreviewItems } from "@/lib/preview";
import { isArchived } from "@/lib/services";

export const metadata = { title: "Preview" };

export default async function PreviewPage() {
  const [companies, rules, pricing] = await Promise.all([getCompanies(), getStatusRules(), getPricing()]);
  const open = companies.filter((company) => !isArchived(company));
  const today = getToday();
  const items = buildPreviewItems(open, pricing, rules, today, 31);

  return <PreviewView items={items} today={today} currency={pricing.currency} />;
}
