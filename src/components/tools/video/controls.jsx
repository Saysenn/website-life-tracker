"use client";

import { Check, ChevronDown, Copy, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ProgressBar } from "../drop-zone";

export function Select({ label, value, onChange, options, disabled, className }) {
  return (
    <label className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}>
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      <span className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-xl bg-sunken pr-9 pl-3 text-sm font-semibold text-ink outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ink/15 disabled:opacity-50"
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-[1.5rem] -translate-y-1/2 text-ink-3" />
      </span>
    </label>
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1, suffix, disabled }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      <span className="flex h-10 items-center rounded-xl bg-sunken pr-3 focus-within:ring-2 focus-within:ring-ink/15">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(String(Math.min(max, Math.max(min, Number(value) || min))))}
          className="h-full w-full min-w-0 bg-transparent pl-3 text-sm font-semibold tabular-nums outline-none"
        />
        {suffix && <span className="text-sm text-ink-3">{suffix}</span>}
      </span>
    </label>
  );
}

export function Choice({ label, value, onChange, options, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      <div className="grid gap-1 rounded-xl bg-sunken p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              "flex min-h-9 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-50",
              value === option.value && "bg-surface text-ink shadow-card",
            )}
          >
            {option.label}
            {option.note && <span className="text-2xs font-normal text-ink-3">{option.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Start button that turns into a progress card with Stop while running. */
export function RunButton({ running, progress, detail, onStart, onStop, label, disabled }) {
  if (!running) {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-base font-semibold text-ground transition-colors hover:bg-ink/85 disabled:opacity-50"
      >
        {label}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-sunken p-3.5">
      <div className="flex items-center gap-2.5">
        <Spinner className="size-[1.6rem] text-ink-3" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{detail || "Working…"}</p>
        <span className="text-sm font-semibold tabular-nums">{Math.round(progress * 100)}%</span>
        <button
          type="button"
          onClick={onStop}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-xs font-semibold shadow-card hover:bg-hover"
        >
          <Square className="size-[1.1rem] fill-current" />
          Stop
        </button>
      </div>
      <ProgressBar value={progress} tone="data" />
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it manually.");
        }
      }}
      className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-ground hover:bg-ink/85"
    >
      {copied ? <Check className="size-[1.5rem]" /> : <Copy className="size-[1.5rem]" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function SmallButton({ onClick, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 items-center gap-1.5 rounded-lg bg-sunken px-3 text-sm font-medium transition-colors hover:bg-hover disabled:opacity-50 [&_svg]:size-[1.5rem]"
    >
      {children}
    </button>
  );
}
