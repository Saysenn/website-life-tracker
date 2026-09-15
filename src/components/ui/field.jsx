import { cn } from "@/lib/utils";

export const controlClass =
  "w-full rounded-lg bg-sunken px-3 text-base text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-4 hover:bg-hover focus:bg-surface focus:shadow-[0_0_0_3px_rgb(140_108_70/0.18)] focus-visible:outline-none aria-invalid:shadow-[0_0_0_3px_rgb(166_63_42/0.2)] data-[invalid=true]:shadow-[0_0_0_3px_rgb(166_63_42/0.2)] disabled:opacity-50";

export function Input({ className, ...props }) {
  return <input className={cn(controlClass, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(controlClass, "min-h-22 resize-y py-2 leading-relaxed", className)} {...props} />;
}

export function Field({ label, htmlFor, error, hint, aside, className, children }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <div className="flex min-h-4 items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
