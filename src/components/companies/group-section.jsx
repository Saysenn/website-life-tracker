"use client";

import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, Ellipsis, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { formatTotals, formatUsdt } from "@/lib/money";
import { cn, plural } from "@/lib/utils";
import { ServiceTable, statusSummary } from "./service-table";

function CountPill({ tone, label, count }) {
  if (!count) return null;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap tabular-nums", tone)}>
      {label} {count}
    </span>
  );
}

export function GroupSection({
  section,
  collapsed,
  dragging,
  pricing,
  selectedId,
  onToggle,
  onTab,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onRenewToday,
  onCloseService,
}) {
  const { group, members, tables, active } = section;
  const groupId = group?.id ?? null;
  const { setNodeRef, isOver } = useDroppable({ id: `group:${groupId ?? "none"}`, data: { groupId } });
  const isTarget = isOver && dragging && (dragging.groupId ?? null) !== groupId;
  const payment = [group?.paymentMethod, group?.paymentType].filter(Boolean).join(" · ");
  const name = group?.name ?? "No group";

  const tabs = tables.map((table) => ({
    value: table.service.key,
    label: table.service.label,
    count: table.rows.length,
    dot: table.rebuy
      ? "rebuy"
      : table.ended
        ? "ended"
        : table.suspended
          ? "suspended"
          : table.renewal
            ? "renewal"
            : undefined,
  }));

  return (
    <section
      ref={setNodeRef}
      id={group ? `group-${group.id}` : "group-none"}
      className={cn(
        "scroll-mt-16 rounded-2xl bg-surface shadow-card transition-[background-color,box-shadow] duration-150 animate-rise",
        isTarget && "bg-data-soft/40 shadow-[0_0_0_2px_rgb(47_111_159/0.3),var(--shadow-card)]",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="-ml-1 flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-sunken"
        >
          <ChevronDown
            className={cn("size-[1.4rem] shrink-0 text-ink-3 transition-transform duration-200", collapsed && "-rotate-90")}
          />
          <h2 className="truncate text-base font-semibold">{name}</h2>
          <Tooltip label={plural(members.length, "company", "companies")}>
            <span className="rounded-full bg-sunken px-1.5 text-2xs font-medium text-ink-3 tabular-nums">
              {members.length}
            </span>
          </Tooltip>
        </button>
        {payment && (
          <span title="Default payment for this group" className="flex items-center gap-1.5 text-xs text-ink-3">
            <Wallet className="size-[1.2rem]" strokeWidth={1.75} />
            {payment}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {section.archived > 0 && (
            <Tooltip label="Closed services live in the archive">
              <Link
                href="/archive"
                className="rounded-full bg-sunken px-2 py-0.5 text-2xs font-medium whitespace-nowrap text-ink-3 tabular-nums transition-colors hover:bg-hover hover:text-ink"
              >
                Archived {section.archived}
              </Link>
            </Tooltip>
          )}
          <CountPill tone="bg-danger text-white" label="Rebuy" count={section.rebuy} />
          <CountPill tone="bg-serious-soft text-serious" label="Suspended" count={section.suspended} />
          <CountPill tone="bg-danger-soft text-danger" label="Ended" count={section.ended} />
          <CountPill tone="bg-warning-soft text-warning" label="Renewal" count={section.renewal} />
          <Button variant="ghost" size="sm" onClick={onAdd}>
            <Plus /> Add
          </Button>
          {group && (
            <Menu
              label="Group options"
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`${name} options`}>
                  <Ellipsis />
                </Button>
              }
            >
              <MenuItem onSelect={onEdit}>
                <Pencil /> Edit group
              </MenuItem>
              <MenuItem danger onSelect={onDelete}>
                <Trash2 /> Delete group
              </MenuItem>
            </Menu>
          )}
        </div>
      </header>

      {!collapsed &&
        (members.length === 0 ? (
          <div className="mx-3 mb-3 flex flex-col items-center rounded-xl bg-sunken/70 px-4 py-7 text-center sm:mx-4">
            <p className="text-sm text-ink-2">No companies in this group yet</p>
            <p className="mt-0.5 text-xs text-ink-3">Drag a company here or add a new one</p>
          </div>
        ) : (
          <div className="px-1.5 pb-3 sm:px-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 pb-2.5">
              <Segmented label={`${name} services`} value={active.service.key} onChange={onTab} options={tabs} />
              {active.cost.usdt > 0 && (
                <span className="text-xs whitespace-nowrap text-ink-2">
                  {formatTotals(active.cost.totals, pricing.currency)}
                  <span className="text-data"> · {formatUsdt(active.cost.usdt)}</span>
                  <span className="text-ink-4"> {active.service.cycle}</span>
                </span>
              )}
              <span className="truncate text-xs text-ink-4">{statusSummary(active.rows)}</span>
            </div>
            {active.rows.length ? (
              <ServiceTable
                service={active.service}
                rows={active.rows}
                pricing={pricing}
                selectedId={selectedId}
                onSelect={onSelect}
                onRenewToday={onRenewToday}
                onCloseService={onCloseService}
              />
            ) : (
              <p className="px-2 py-8 text-center text-sm text-ink-3">
                No {active.service.label.toLowerCase()} matches this filter
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
