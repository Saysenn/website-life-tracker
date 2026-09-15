"use client";

import { Dialog } from "@/components/ui/dialog";
import { StatusDot } from "@/components/ui/status";
import { cn } from "@/lib/utils";

const grid = "grid grid-cols-[minmax(0,1fr)_auto_9rem] items-baseline gap-x-3";

export function StatModal({ open, onClose, title, description, amountLabel, rows, empty }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={title}
      description={description}
      className="max-w-[44rem]"
      autoFocus={false}
    >
      {rows.length ? (
        <ul className="-mx-2 grid">
          <li className={cn(grid, "px-2 pb-1.5 text-2xs text-ink-4")}>
            <span>Group</span>
            <span aria-hidden />
            <span className="text-right">{amountLabel}</span>
          </li>

          {rows.map((row) => (
            <li key={row.key} className={cn(grid, "rounded-lg px-2 py-2 transition-colors hover:bg-sunken")}>
              <span className="flex min-w-0 items-baseline gap-1.5">
                {row.status && <StatusDot status={row.status} />}
                <span className="truncate text-xs text-ink-2">{row.label}</span>
              </span>
              <span className="hidden text-2xs text-ink-4 tabular-nums sm:inline">{row.hint}</span>
              <span className="text-right text-xs tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-xs text-ink-3">{empty}</p>
      )}
    </Dialog>
  );
}
