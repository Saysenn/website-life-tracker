"use client";

import { endOfMonth, parseISO } from "date-fns";
import { CalendarCheck, CircleCheck } from "lucide-react";
import Link from "next/link";
import { startTransition, useOptimistic, useState } from "react";
import { toast } from "sonner";
import { setServiceDates } from "@/actions/companies";
import { CopyPassword } from "@/components/companies/copy-password";
import { PaymentList } from "@/components/preview/payment-list";
import { Page, PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/ui/status";
import { Tooltip } from "@/components/ui/tooltip";
import { daysUntil, formatDate, relativeDays, toISODate } from "@/lib/dates";
import { formatMoney, formatTotals, formatUsdt } from "@/lib/money";
import { totalsOf } from "@/lib/preview";
import { endFrom, SERVICE_BY_KEY } from "@/lib/services";
import { cn, plural } from "@/lib/utils";

const WINDOWS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "2 weeks" },
  { value: "month", label: "This month" },
];

const headClass = "px-2 py-1.5 text-left text-2xs font-medium text-ink-3";
const cellClass = "px-2 py-2.5 align-middle transition-colors first:rounded-l-lg last:rounded-r-lg group-hover:bg-sunken";

function Figure({ label, value, hint, strong }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-2xs", strong ? "text-ground/60" : "text-ground/50")}>{label}</p>
      <p className={cn("mt-1 truncate font-semibold tabular-nums", strong ? "text-xl" : "text-base")}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-2xs text-ground/50">{hint}</p>}
    </div>
  );
}

export function PreviewView({ items, today, currency }) {
  const [range, setRange] = useState("7");
  const [group, setGroup] = useState("all");
  const [rows, renewRow] = useOptimistic(items, (current, id) => current.filter((item) => item.id !== id));

  function renew(item) {
    const service = SERVICE_BY_KEY[item.service];
    const end = endFrom(service, today);
    startTransition(async () => {
      renewRow(item.id);
      const result = await setServiceDates(item.companyId, item.service, { start: today, end });
      if (result.ok) {
        toast.success(`${item.company} renewed until ${formatDate(end)}`, {
          action: {
            label: "Undo",
            onClick: () => setServiceDates(item.companyId, item.service, { start: item.start ?? null, end: item.end }),
          },
        });
      } else {
        toast.error(result.error);
      }
    });
  }

  const days = range === "month" ? daysUntil(toISODate(endOfMonth(parseISO(today))), today) : Number(range);
  const visible = rows.filter((item) => item.days <= days);
  const groups = [...new Set(visible.map((item) => item.group))].sort();
  const active = group !== "all" && groups.includes(group) ? group : "all";
  const shown = active === "all" ? visible : visible.filter((item) => item.group === active);
  const totals = totalsOf(shown);

  const tabs = [
    { value: "all", label: "All groups", count: visible.length },
    ...groups.map((name) => ({ value: name, label: name, count: visible.filter((item) => item.group === name).length })),
  ];

  return (
    <Page>
      <PageHeader
        title="Renewal preview"
        description="RDPs that need paying soon, and what to send"
        actions={
          <>
            <Segmented label="Window" value={range} onChange={setRange} options={WINDOWS} />
            <PaymentList items={visible} rangeLabel={WINDOWS.find((option) => option.value === range).label} />
          </>
        }
      />

      {visible.length ? (
        <div className="mt-5 grid gap-4">
          <Segmented label="Groups" value={active} onChange={setGroup} options={tabs} className="w-fit max-w-full flex-wrap" />

          <div className="grid gap-5 rounded-2xl bg-ink p-5 text-ground shadow-card animate-rise lg:grid-cols-3">
            <Figure label="Raw price" value={formatTotals(totals.raw, currency)} hint={plural(totals.count, "renewal")} />
            <Figure strong label="To send in USDT" value={formatUsdt(totals.usdt)} hint="At today's rates" />
            <div className="min-w-0">
              <p className="text-2xs text-ground/50">Gas needed, per network</p>
              <ul className="mt-1.5 grid gap-1">
                {Object.entries(totals.gas).map(([network, gas]) => (
                  <li key={network} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-ground/80">{network}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-medium">{gas.currency ? formatMoney(gas.amount, gas.currency) : "No fee set"}</span>
                      <span className="text-ground/50"> · {plural(gas.transfers, "transfer")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl bg-surface p-3 shadow-card animate-rise sm:p-4">
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={headClass}>Company</th>
                  <th className={cn(headClass, "w-[13rem]")}>Renewal date</th>
                  <th className={cn(headClass, "hidden w-[11rem] md:table-cell")}>Status</th>
                  <th className={cn(headClass, "hidden w-[13rem] lg:table-cell")}>Payment</th>
                  <th className={cn(headClass, "w-[13rem] text-right")}>Price</th>
                  <th className={cn(headClass, "w-[7.5rem] text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id} className="group">
                    <td className={cellClass}>
                      <Link href={`/companies?id=${item.companyId}`} className="block min-w-0">
                        <p className="truncate font-medium text-ink">{item.company}</p>
                        <p className="truncate text-xs text-ink-3">{item.account || item.website || item.group}</p>
                      </Link>
                    </td>
                    <td className={cellClass}>
                      <p className="text-ink tabular-nums">{formatDate(item.end)}</p>
                      <p className={cn("text-xs", item.days < 0 ? "text-danger" : "text-ink-3")}>{relativeDays(item.days)}</p>
                    </td>
                    <td className={cn(cellClass, "hidden md:table-cell")}>
                      <StatusBadge status={item.status} />
                    </td>
                    <td className={cn(cellClass, "hidden text-ink-2 lg:table-cell")}>
                      <p className="truncate">{item.paymentMethod || "Not set"}</p>
                      {item.gas && (
                        <p className="text-xs text-ink-3 tabular-nums">
                          {formatMoney(item.gas.amount, item.gas.currency)} gas
                        </p>
                      )}
                    </td>
                    <td className={cn(cellClass, "text-right")}>
                      {item.price ? (
                        <>
                          <p className="text-ink tabular-nums">{formatMoney(item.price.amount, item.price.currency)}</p>
                          <p className="text-xs text-data tabular-nums">{formatUsdt(item.usdt)}</p>
                        </>
                      ) : (
                        <span className="text-ink-4">No price</span>
                      )}
                    </td>
                    <td className={cn(cellClass, "text-right")}>
                      <div className="flex items-center justify-end gap-0.5">
                        {item.hasProviderPassword && <CopyPassword companyId={item.companyId} kind="provider" />}
                        {item.hasPassword && <CopyPassword companyId={item.companyId} />}
                        <Tooltip label={`${item.serviceLabel} renewed today`}>
                          <button
                            type="button"
                            aria-label={`Mark ${item.company} renewed today`}
                            onClick={() => renew(item)}
                            className="flex size-6.5 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-hover hover:text-ink"
                          >
                            <CalendarCheck className="size-[1.4rem]" />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totals.withoutPrice > 0 && (
              <p className="px-2 pt-3 text-xs text-ink-4">
                {plural(totals.withoutPrice, "renewal")} without a price, so not counted in the totals
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center rounded-2xl bg-surface px-6 py-16 text-center shadow-card animate-rise">
          <CircleCheck className="size-[2.4rem] text-success" strokeWidth={1.5} />
          <p className="mt-3 text-base font-semibold">Nothing to pay yet</p>
          <p className="mt-1 max-w-[38rem] text-sm text-ink-3">
            {range === "month" ? "No RDP renews this month." : `No RDP renews in the next ${days} days. Try a longer window.`}
          </p>
        </div>
      )}
    </Page>
  );
}
