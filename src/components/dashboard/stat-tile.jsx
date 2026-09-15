"use client";

import { useState } from "react";
import { StatusDot } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { StatModal } from "./stat-modal";

export function StatTile({ label, value, hint, status, accent, amountLabel, rows, empty }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full cursor-pointer rounded-2xl p-4 text-left shadow-card transition-shadow duration-200 animate-rise hover:shadow-[0_6px_24px_rgb(64_48_26/0.09)]",
          accent ? "bg-ink text-ground" : "bg-surface",
        )}
      >
        <p className={cn("flex items-center gap-2 text-xs", accent ? "text-ground/60" : "text-ink-3")}>
          {status && <StatusDot status={status} />}
          {label}
        </p>
        <p className="mt-2.5 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className={cn("mt-0.5 truncate text-xs", accent ? "text-ground/60" : "text-ink-3")}>{hint}</p>
      </button>

      <StatModal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={`${value} · ${hint}`}
        amountLabel={amountLabel}
        rows={rows}
        empty={empty}
      />
    </>
  );
}
