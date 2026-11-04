"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "./drop-zone";

/** Overall progress card. Sticks to the bottom of the screen so the main action is always in thumb reach. */
export function QueueSummary({ stats, title, subtitle, action, onClear }) {
  const finished = stats.total > 0 && !stats.busy && stats.queued === 0;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-grid bg-ground/90 px-4 pt-3 pb-[max(1.2rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:mx-0 sm:mt-0 sm:mb-3 sm:rounded-2xl sm:border-0 sm:bg-surface sm:p-4 sm:shadow-card">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          <p className="truncate text-xs text-ink-3 tabular-nums">{subtitle}</p>
        </div>
        <span className="text-sm font-semibold text-ink-2 tabular-nums">{Math.round(stats.progress * 100)}%</span>
      </div>
      <ProgressBar
        value={stats.progress}
        tone={finished ? (stats.failed === stats.total ? "danger" : "success") : "data"}
        className="mt-2.5 h-2"
      />
      <div className="mt-3 flex items-center gap-2">
        <div className={cn("flex flex-1 gap-2", "[&>*]:flex-1 sm:[&>*]:flex-none")}>{action}</div>
        <button
          type="button"
          onClick={onClear}
          disabled={stats.busy}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink disabled:opacity-40"
        >
          <Trash2 className="size-[1.5rem]" />
          <span className="hidden sm:inline">Clear all</span>
        </button>
      </div>
    </div>
  );
}

export function BigButton({ className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-ground transition-colors hover:bg-ink/85 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[1.6rem]",
        className,
      )}
      {...props}
    />
  );
}
