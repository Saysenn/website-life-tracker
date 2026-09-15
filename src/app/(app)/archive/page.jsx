import { ArchiveView } from "@/components/archive/archive-view";
import { getCompanies, getGroups, TIMEZONE } from "@/lib/data";

export const metadata = { title: "Archive" };

export default async function ArchivePage() {
  const [companies, groups] = await Promise.all([getCompanies(), getGroups()]);
  return <ArchiveView companies={companies} groups={groups} timezone={TIMEZONE} />;
}
