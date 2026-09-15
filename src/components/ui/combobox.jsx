"use client";

import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { controlClass } from "./field";

const itemClass =
  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm text-ink-2 select-none data-[selected=true]:bg-sunken data-[selected=true]:text-ink [&_svg]:size-[1.4rem] [&_svg]:shrink-0";

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

export function Combobox({ id, value, onChange, options, placeholder = "Select", creatable = true, invalid, className }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const list = value && !options.some((option) => same(option, value)) ? [value, ...options] : options;
  const visible = list.filter((option) => option.toLowerCase().includes(typed.toLowerCase()));
  const canCreate = creatable && typed && !list.some((option) => same(option, typed));

  function choose(next) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover.Root
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          data-invalid={invalid || undefined}
          className={cn(controlClass, "flex h-9 items-center justify-between gap-2 text-left", className)}
        >
          <span className={cn("truncate", !value && "text-ink-4")}>{value || placeholder}</span>
          <ChevronsUpDown className="size-[1.3rem] shrink-0 text-ink-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-(--radix-popover-trigger-width) min-w-56 overflow-hidden rounded-xl bg-surface shadow-float animate-pop"
        >
          <Command loop shouldFilter={false}>
            <div className="flex items-center gap-2 px-3">
              <Search className="size-[1.4rem] shrink-0 text-ink-3" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={creatable ? "Search or add new" : "Search"}
                className="h-10 w-full bg-transparent text-base outline-none placeholder:text-ink-4"
              />
            </div>
            <Command.List className="max-h-64 overflow-y-auto p-1.5 pt-0">
              {visible.map((option) => (
                <Command.Item key={option} value={option} onSelect={() => choose(option)} className={itemClass}>
                  <span className="truncate">{option}</span>
                  {value && same(option, value) && <Check className="ml-auto text-ink" />}
                </Command.Item>
              ))}
              {canCreate && (
                <Command.Item value={`create:${typed}`} onSelect={() => choose(typed)} className={itemClass}>
                  <Plus className="text-ink-3" />
                  <span className="truncate">
                    Add <span className="font-medium text-ink">{typed}</span>
                  </span>
                </Command.Item>
              )}
              {value && !typed && (
                <Command.Item value="clear:" onSelect={() => choose("")} className={cn(itemClass, "text-ink-3")}>
                  Clear selection
                </Command.Item>
              )}
              {!visible.length && !canCreate && (
                <p className="px-2.5 py-2 text-sm text-ink-3">{creatable ? "Type to add a new one" : "No matches"}</p>
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
