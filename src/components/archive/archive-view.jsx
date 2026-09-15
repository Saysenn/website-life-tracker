"use client";

import { ArchiveRestore, Inbox } from "lucide-react";
import { startTransition, useMemo, useOptimistic } from "react";
import { toast } from "sonner";
import { reopenService } from "@/actions/companies";
import { Button } from "@/components/ui/button";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { SERVICES } from "@/lib/services";
import { cn, plural } from "@/lib/utils";

const headClass = "px-2 py-1.5 text-left text-2xs font-medium text-ink-3";
const cellClass = "px-2 py-2.5 align-middle transition-colors first:rounded-l-lg last:rounded-r-lg group-hover:bg-sunken";

function reducer(state, action) {
  return state.map((company) => (company.id === action.id ? { ...company, [action.field]: null } : company));
}

export function ArchiveView({ companies, groups, timezone }) {
  const [items, apply] = useOptimistic(companies, reducer);

  const sections = useMemo(() => {
    const buckets = new Map([...groups.map((group) => [group.id, []]), [null, []]]);
    for (const company of items) (buckets.get(company.groupId) ?? buckets.get(null)).push(company);

    return [...groups.map((group) => ({ group, members: buckets.get(group.id) })), { group: null, members: buckets.get(null) }]
      .map(({ group, members }) => ({
        key: group?.id ?? "none",
        name: group?.name ?? "No group",
        tables: SERVICES.map((service) => ({
          service,
          rows: members.filter((company) => company[service.closed]),
        })).filter((table) => table.rows.length),
      }))
      .filter((section) => section.tables.length);
  }, [items, groups]);

  const total = sections.reduce(
    (sum, section) => sum + section.tables.reduce((count, table) => count + table.rows.length, 0),
    0,
  );

  function reopen(company, service) {
    startTransition(async () => {
      apply({ id: company.id, field: service.closed });
      const result = await reopenService(company.id, service.key);
      if (result.ok) toast.success(`${company.name} ${service.label} is back on the Companies page`);
      else toast.error(result.error);
    });
  }

  return (
    <Page>
      <PageHeader
        title="Archive"
        description={
          total
            ? `${plural(total, "closed service")} across ${plural(sections.length, "group")}`
            : "Services you have stopped renewing"
        }
      />

      {sections.length ? (
        <div className="mt-5 grid gap-4">
          {sections.map((section) => (
            <Card key={section.key} title={section.name} className="animate-rise">
              <div className="grid gap-5">
                {section.tables.map((table) => (
                  <div key={table.service.key}>
                    <h3 className="mb-1 px-2 text-sm font-semibold text-ink-2">{table.service.label}</h3>
                    <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr>
                          <th className={headClass}>Company</th>
                          <th className={cn(headClass, "hidden w-[12rem] sm:table-cell")}>Start date</th>
                          <th className={cn(headClass, "w-[12rem]")}>{table.service.endLabel}</th>
                          <th className={cn(headClass, "hidden w-[16rem] md:table-cell")}>Closed</th>
                          <th className={cn(headClass, "w-[11rem] text-right")}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((company) => (
                          <tr key={company.id} className="group">
                            <td className={cellClass}>
                              <p className="truncate font-medium text-ink">{company.name}</p>
                              {company.website && <p className="truncate text-xs text-ink-3">{company.website}</p>}
                            </td>
                            <td className={cn(cellClass, "hidden text-ink-2 tabular-nums sm:table-cell")}>
                              {formatDate(company[table.service.start]) || <span className="text-ink-4">Not set</span>}
                            </td>
                            <td className={cn(cellClass, "text-ink-2 tabular-nums")}>
                              {formatDate(company[table.service.end]) || <span className="text-ink-4">Not set</span>}
                            </td>
                            <td className={cn(cellClass, "hidden text-ink-3 tabular-nums md:table-cell")}>
                              {formatTimestamp(company[table.service.closed], timezone)}
                            </td>
                            <td className={cn(cellClass, "text-right")}>
                              <Button variant="soft" size="sm" onClick={() => reopen(company, table.service)}>
                                <ArchiveRestore /> Reopen
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center rounded-2xl bg-surface px-6 py-16 text-center shadow-card animate-rise">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-sunken text-ink-3">
            <Inbox className="size-[2rem]" strokeWidth={1.5} />
          </span>
          <p className="mt-4 text-base font-semibold">Nothing archived yet</p>
          <p className="mt-1 max-w-[40rem] text-sm text-ink-3">
            Closing a domain, hosting or RDP on the Companies page moves it here. You can bring it back any time.
          </p>
        </div>
      )}
    </Page>
  );
}
