import { cn } from "@/lib/utils";

export function BrandMark({ className }) {
  return (
    <span className={cn("flex size-6.5 shrink-0 items-center justify-center rounded-lg bg-ink text-ground", className)}>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-[62%]">
        <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 5.2V8l2 1.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Brand() {
  return (
    <span className="flex items-center gap-2">
      <BrandMark />
      <span className="text-base font-semibold tracking-tight">Life Tracker</span>
    </span>
  );
}
