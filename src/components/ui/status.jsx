import { relativeDays } from "@/lib/dates";
import { STATUSES } from "@/lib/services";
import { cn } from "@/lib/utils";

const badgeTones = {
  active: "bg-success-soft text-success",
  renewed: "bg-success-soft text-success",
  renewal: "bg-warning-soft text-warning",
  suspended: "bg-serious-soft text-serious",
  rebuy: "bg-danger text-white",
  ended: "bg-danger-soft text-danger",
  upcoming: "bg-data-soft text-data",
  unset: "bg-sunken text-ink-3",
  closed: "bg-sunken text-ink-3",
};

const dotTones = {
  active: "bg-good",
  renewed: "bg-good",
  renewal: "bg-amber",
  suspended: "bg-serious",
  rebuy: "bg-danger",
  ended: "bg-danger",
  upcoming: "bg-data",
  unset: "bg-ink-4",
  closed: "bg-ink-4",
};

const textTones = {
  active: "text-ink-3",
  renewed: "text-success",
  renewal: "text-warning",
  suspended: "text-serious",
  rebuy: "text-danger",
  ended: "text-danger",
  upcoming: "text-ink-3",
  unset: "text-ink-4",
  closed: "text-ink-4",
};

export function StatusBadge({ status, className }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        badgeTones[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", status === "rebuy" ? "bg-white" : dotTones[status])} />
      {STATUSES[status]}
    </span>
  );
}

export function StatusDot({ status, className }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", dotTones[status], className)} />;
}

export function DaysLeft({ state, className }) {
  if (state.days === null) return null;
  return <span className={cn("text-xs whitespace-nowrap", textTones[state.status], className)}>{relativeDays(state.days)}</span>;
}
