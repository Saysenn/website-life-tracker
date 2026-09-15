"use client";

import { Sheet } from "@/components/ui/dialog";

export function CompanyPanel({ open, docked, title, onClose, children }) {
  if (docked) {
    if (!open) return null;
    return (
      <aside className="w-[42rem] shrink-0 py-4 pr-4 xl:w-[46rem]">
        <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-card animate-rise">{children}</div>
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title={title}>
      {children}
    </Sheet>
  );
}
