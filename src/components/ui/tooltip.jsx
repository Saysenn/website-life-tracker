"use client";

import { Tooltip as RadixTooltip } from "radix-ui";

export function TooltipProvider({ children }) {
  return (
    <RadixTooltip.Provider delayDuration={250} skipDelayDuration={400}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({ label, side = "top", children }) {
  if (!label) return children;

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[60] rounded-md bg-ink px-2 py-1 text-2xs font-medium text-ground shadow-float select-none animate-pop"
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
