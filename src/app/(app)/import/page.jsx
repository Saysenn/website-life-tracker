import { AccountImport } from "@/components/companies/account-import";
import { getCompanies, getGroups } from "@/lib/data";

export const metadata = { title: "Import accounts" };

export default async function ImportPage() {
  const [companies, groups] = await Promise.all([getCompanies(), getGroups()]);
  const list = companies.map(({ id, name, groupName }) => ({ id, name, groupName }));

  return <AccountImport companies={list} groups={groups.map(({ id, name }) => ({ id, name }))} />;
}
