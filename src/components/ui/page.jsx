import { cn } from "@/lib/utils";

export function Page({ className, children }) {
  return <div className={cn("mx-auto w-full max-w-[132rem] px-4 py-5 lg:px-8 lg:py-7", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, className, children }) {
  return (
    <section className={cn("flex flex-col rounded-2xl bg-surface p-4 shadow-card sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
