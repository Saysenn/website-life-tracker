"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { formatDate, parseDate, toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { controlClass } from "./field";
import { Tooltip } from "./tooltip";

const navButton =
  "inline-flex size-7 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30";

const pickerClasses = {
  root: "relative select-none",
  months: "relative",
  month: "grid gap-2",
  month_caption: "flex h-8 items-center",
  caption_label: "inline-flex items-center gap-1 text-sm font-medium text-ink",
  dropdowns: "flex items-center gap-0.5",
  dropdown_root: "relative inline-flex h-7 items-center rounded-md px-1.5 transition-colors hover:bg-sunken",
  dropdown: "absolute inset-0 w-full cursor-pointer appearance-none opacity-0",
  nav: "absolute top-0 right-0 z-10 flex h-8 items-center gap-0.5",
  button_previous: navButton,
  button_next: navButton,
  month_grid: "border-collapse",
  weekday: "size-9 text-center text-2xs font-medium text-ink-4",
  day: "size-9 p-0 text-center",
  day_button:
    "inline-flex size-9 items-center justify-center rounded-lg text-sm text-ink-2 tabular-nums transition-colors hover:bg-sunken hover:text-ink",
  today: "[&>button]:font-semibold [&>button]:text-data",
  selected: "[&>button]:bg-ink [&>button]:text-ground [&>button]:hover:bg-ink [&>button]:hover:text-ground",
  outside: "[&>button]:text-ink-4",
  disabled: "opacity-40",
  hidden: "invisible",
};

function Chevron({ orientation }) {
  if (orientation === "left") return <ChevronLeft className="size-[1.4rem]" />;
  if (orientation === "right") return <ChevronRight className="size-[1.4rem]" />;
  return <ChevronDown className="size-[1.1rem] text-ink-3" />;
}

export function DateField({ id, value, onChange, today, invalid, placeholder = "Pick a date" }) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDate(value) : undefined;

  function pick(next) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover.Root modal open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            data-invalid={invalid || undefined}
            className={cn(controlClass, "flex h-9 items-center gap-2 pr-8 text-left")}
          >
            <CalendarDays className="size-[1.4rem] shrink-0 text-ink-3" />
            <span className={cn("truncate tabular-nums", !value && "text-ink-4")}>
              {value ? formatDate(value) : placeholder}
            </span>
          </button>
        </Popover.Trigger>
        {value && (
          <Tooltip label="Clear date">
            <button
              type="button"
              aria-label="Clear date"
              onClick={() => onChange("")}
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <X className="size-[1.2rem]" />
            </button>
          </Tooltip>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className="z-50 rounded-xl bg-surface p-3 shadow-float animate-pop">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(day) => pick(day ? toISODate(day) : "")}
            defaultMonth={selected}
            weekStartsOn={1}
            showOutsideDays
            captionLayout="dropdown"
            startMonth={new Date(2010, 0)}
            endMonth={new Date(2045, 11)}
            classNames={pickerClasses}
            components={{ Chevron }}
          />
          <button
            type="button"
            onClick={() => pick(today)}
            className="mt-2 h-7 rounded-md bg-sunken px-2.5 text-xs text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            Today
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
