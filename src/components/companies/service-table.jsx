"use client";

import { useDraggable } from "@dnd-kit/core";
import { Archive, CalendarCheck, Globe, GripVertical, HardDrive, Monitor } from "lucide-react";
import { CopyPassword } from "@/components/companies/copy-password";
import { DaysLeft, StatusBadge } from "@/components/ui/status";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatUsdt, priceOf, usdtOf } from "@/lib/money";
import { STATUSES } from "@/lib/services";
import { cn } from "@/lib/utils";

export const SERVICE_ICONS = { domain: Globe, hosting: HardDrive, rdp: Monitor };

const STATUS_ORDER = ["ended", "renewal", "active", "upcoming", "unset"];

export function statusSummary(rows) {
  const counts = {};
  for (const { state } of rows) counts[state.status] = (counts[state.status] ?? 0) + 1;
  return STATUS_ORDER.filter((status) => counts[status])
    .map((status) => `${counts[status]} ${STATUSES[status].toLowerCase()}`)
    .join(", ");
}

const headClass = "px-2 py-1.5 text-left text-2xs font-medium text-ink-3";

export function ServiceTable({ service, rows, pricing, selectedId, onSelect, onRenewToday, onCloseService }) {
  return (
    <div className="@container">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={headClass}>Company</th>
            <th className={cn(headClass, "hidden w-[12rem] @min-[58rem]:table-cell")}>Start date</th>
            <th className={cn(headClass, "w-[12.5rem]")}>{service.endLabel}</th>
            <th className={cn(headClass, "w-[10.5rem]")}>Status</th>
            {service.billable && <th className={cn(headClass, "hidden w-[12rem] @min-[68rem]:table-cell")}>Price</th>}
            <th className={cn(headClass, "hidden w-[13rem] @min-[84rem]:table-cell")}>Payment</th>
            <th className={cn(headClass, "w-[8rem] text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ServiceRow
              key={row.company.id}
              row={row}
              service={service}
              pricing={pricing}
              selected={row.company.id === selectedId}
              onSelect={onSelect}
              onRenewToday={onRenewToday}
              onCloseService={onCloseService}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowAction({ label, onClick, children }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className="flex size-6.5 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-hover hover:text-ink [&_svg]:size-[1.4rem]"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Muted({ children = "Not set" }) {
  return <span className="text-ink-4">{children}</span>;
}

function ServiceRow({ row, service, pricing, selected, onSelect, onRenewToday, onCloseService }) {
  const { company, state } = row;
  const price = priceOf(company, service, pricing);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `${service.key}:${company.id}`,
    data: { company },
    disabled: company.id < 0,
  });
  const secondary = service.key === "rdp" ? company.digirdpEmail : company.website;
  const cell = cn(
    "px-2 py-2.5 align-middle transition-colors duration-100 first:rounded-l-lg last:rounded-r-lg",
    selected ? "bg-selected" : "group-hover:bg-sunken group-focus-visible:bg-sunken",
  );

  return (
    <tr
      ref={setNodeRef}
      {...listeners}
      data-company-row={company.id}
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(company.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(company.id);
      }}
      className={cn("group cursor-pointer outline-none", isDragging && "opacity-40", company.id < 0 && "opacity-60")}
    >
      <td className={cell}>
        <div className="flex items-center gap-1.5">
          <GripVertical className="-ml-1 size-[1.3rem] shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{company.name}</p>
            {secondary && <p className="truncate text-xs text-ink-3">{secondary}</p>}
          </div>
        </div>
      </td>
      <td className={cn(cell, "hidden @min-[58rem]:table-cell")}>
        {state.start ? <span className="text-ink-2 tabular-nums">{formatDate(state.start)}</span> : <Muted />}
      </td>
      <td className={cell}>
        {state.end ? (
          <div className="leading-tight">
            <p className="text-ink tabular-nums">{formatDate(state.end)}</p>
            <DaysLeft state={state} />
          </div>
        ) : (
          <Muted />
        )}
      </td>
      <td className={cell}>
        <StatusBadge status={state.status} />
      </td>
      {service.billable && (
        <td className={cn(cell, "hidden @min-[68rem]:table-cell")}>
          {price === null ? (
            <Muted />
          ) : (
            <div className="leading-tight">
              <p className="text-ink tabular-nums">{formatMoney(price.amount, price.currency)}</p>
              <p className="text-xs text-data tabular-nums">{formatUsdt(usdtOf(price, pricing.rates))}</p>
            </div>
          )}
        </td>
      )}
      <td className={cn(cell, "hidden @min-[84rem]:table-cell")}>
        {company.paymentMethod ? (
          <div className="leading-tight">
            <p className="truncate text-ink-2">{company.paymentMethod}</p>
            {company.paymentType && <p className="truncate text-xs text-ink-3">{company.paymentType}</p>}
          </div>
        ) : (
          <Muted />
        )}
      </td>
      <td className={cell}>
        <div className="flex items-center justify-end gap-0.5">
          {service.key === "rdp" && company.hasPassword && <CopyPassword companyId={company.id} />}
          <RowAction label={`${service.label} renewed today`} onClick={() => onRenewToday(company, service)}>
            <CalendarCheck />
          </RowAction>
          <RowAction label={`Close ${service.label} and archive it`} onClick={() => onCloseService(company, service)}>
            <Archive />
          </RowAction>
        </div>
      </td>
    </tr>
  );
}

export function DragCard({ company }) {
  return (
    <div className="flex w-[30rem] cursor-grabbing items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 shadow-float">
      <GripVertical className="size-[1.4rem] shrink-0 text-ink-4" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{company.name}</p>
        <p className="text-xs text-ink-3">Drop on a group to move it</p>
      </div>
    </div>
  );
}
