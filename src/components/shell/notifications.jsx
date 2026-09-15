"use client";

import { Bell, CircleCheck } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { useState } from "react";
import { StatusDot } from "@/components/ui/status";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDate, relativeDays } from "@/lib/dates";
import { cn, plural } from "@/lib/utils";

function AlertGroup({ title, items, onNavigate }) {
  if (!items.length) return null;
  return (
    <div className="pt-2">
      <p className="px-2 pb-1 text-2xs font-medium text-ink-3">{title}</p>
      {items.map((alert) => (
        <Link
          key={alert.id}
          href={`/companies?id=${alert.companyId}`}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-sunken"
        >
          <StatusDot status={alert.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{alert.company}</p>
            <p className="text-xs text-ink-3">
              {alert.service} · {formatDate(alert.date)}
            </p>
          </div>
          <span className={cn("text-xs whitespace-nowrap", alert.status === "renewal" ? "text-warning" : "text-danger")}>
            {relativeDays(alert.days)}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function Notifications({ alerts, align = "start", className }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip label="Notifications">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Notifications, ${plural(alerts.length, "item")}`}
            className={cn(
              "relative flex size-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover hover:text-ink",
              className,
            )}
          >
            <Bell className="size-[1.5rem]" strokeWidth={1.75} />
            {alerts.length > 0 && (
              <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-0.5 text-[0.85rem] leading-none font-semibold text-white tabular-nums">
                {alerts.length > 9 ? "9+" : alerts.length}
              </span>
            )}
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[34rem] max-w-[calc(100vw-2.4rem)] overflow-hidden rounded-2xl bg-surface shadow-float animate-pop"
        >
          <div className="flex items-baseline justify-between px-4 pt-4">
            <p className="text-base font-semibold">Notifications</p>
            <span className="text-xs text-ink-3">{alerts.length ? plural(alerts.length, "renewal") : ""}</span>
          </div>
          {alerts.length ? (
            <div className="max-h-[44rem] overflow-y-auto px-2 pb-2">
              <AlertGroup title="Rebuy" items={alerts.filter((alert) => alert.status === "rebuy")} onNavigate={close} />
              <AlertGroup title="Suspended" items={alerts.filter((alert) => alert.status === "suspended")} onNavigate={close} />
              <AlertGroup title="Ended" items={alerts.filter((alert) => alert.status === "ended")} onNavigate={close} />
              <AlertGroup title="Renewal due" items={alerts.filter((alert) => alert.status === "renewal")} onNavigate={close} />
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 pt-5 pb-7 text-center">
              <CircleCheck className="size-[2.2rem] text-success" strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium">All caught up</p>
              <p className="mt-0.5 text-xs text-ink-3">Nothing ends in the next 30 days.</p>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
