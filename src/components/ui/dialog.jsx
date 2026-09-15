"use client";

import { AlertDialog, Dialog as RadixDialog } from "radix-ui";
import { cn } from "@/lib/utils";
import { buttonClass } from "./button";

const overlayClass = "fixed inset-0 z-40 bg-ink/20 animate-fade";
const centerClass =
  "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-3.2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-float animate-pop focus:outline-none";

export function Dialog({ open, onOpenChange, title, description, className, autoFocus = true, children }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlayClass} />
        <RadixDialog.Content
          onOpenAutoFocus={
            autoFocus
              ? undefined
              : (event) => {
                  event.preventDefault();
                  event.currentTarget.focus();
                }
          }
          className={cn(centerClass, "max-w-[46rem]", className)}
        >
          <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
          <RadixDialog.Description className={description ? "mt-1 text-sm text-ink-3" : "sr-only"}>
            {description || title}
          </RadixDialog.Description>
          <div className="mt-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Delete", onConfirm }) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content className={cn(centerClass, "max-w-[38rem]")}>
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-sm text-ink-2">{description}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel className={buttonClass({ variant: "soft" })}>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action className={buttonClass({ variant: "danger" })} onClick={onConfirm}>
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function Sheet({ open, onOpenChange, side = "right", title, className, children }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={cn(overlayClass, "bg-ink/25")} />
        <RadixDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            event.currentTarget.focus();
          }}
          className={cn(
            "fixed inset-y-0 z-50 flex flex-col bg-surface shadow-float focus:outline-none",
            side === "right"
              ? "right-0 w-full max-w-[52rem] animate-slide-in-right"
              : "left-0 w-[82vw] max-w-[30rem] animate-slide-in-left",
            className,
          )}
        >
          <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
