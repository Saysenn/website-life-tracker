"use client";

import { ChevronRight } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

const contentClass = "z-50 min-w-48 rounded-xl bg-surface p-1.5 shadow-float animate-pop";
const itemClass =
  "flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-ink-2 outline-none select-none data-highlighted:bg-sunken data-highlighted:text-ink data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-[1.4rem] [&_svg]:shrink-0 [&_svg]:text-ink-3";

export function Menu({ trigger, label, align = "end", children }) {
  return (
    <DropdownMenu.Root>
      <Tooltip label={label}>
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className={contentClass}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ danger, className, ...props }) {
  return (
    <DropdownMenu.Item
      className={cn(
        itemClass,
        danger && "text-danger data-highlighted:bg-danger-soft data-highlighted:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }) {
  return <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-xs text-ink-3">{children}</DropdownMenu.Label>;
}

export function MenuSub({ label, icon, children }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={cn(itemClass, "data-[state=open]:bg-sunken")}>
        {icon}
        {label}
        <ChevronRight className="ml-auto" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={6} className={cn(contentClass, "max-h-80 overflow-y-auto")}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}
