"use client";

import { Switch as RadixSwitch } from "radix-ui";

export function Switch(props) {
  return (
    <RadixSwitch.Root
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-hover transition-colors duration-200 data-[state=checked]:bg-ink"
      {...props}
    >
      <RadixSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-surface shadow-card transition-transform duration-200 data-[state=checked]:translate-x-[1.8rem]" />
    </RadixSwitch.Root>
  );
}
