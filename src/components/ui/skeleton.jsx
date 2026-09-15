import { cn } from "@/lib/utils";

export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn("animate-shimmer rounded-md bg-skeleton", className)} />;
}

export function Kbd({ className, children }) {
  return (
    <kbd
      className={cn(
        "hidden h-5 min-w-5 items-center justify-center rounded bg-ink/6 px-1 font-sans text-2xs text-ink-3 lg:inline-flex",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
