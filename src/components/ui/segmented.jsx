import { cn } from "@/lib/utils";
import { StatusDot } from "./status";

export function Segmented({ value, onChange, options, label, className }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex shrink-0 items-center gap-0.5 rounded-lg bg-hover p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap text-ink-3 transition-colors hover:text-ink",
              active && "bg-surface font-medium text-ink shadow-card",
            )}
          >
            {option.dot && <StatusDot status={option.dot} className="size-1.5" />}
            {option.label}
            {option.count !== undefined && <span className="text-2xs text-ink-4 tabular-nums">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
