"use client";

import { Archive, Building2, LayoutGrid, LogOut, Menu as MenuIcon, Receipt, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/actions/auth";
import { Sheet } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { GroupModal } from "./group-modal";
import { Notifications } from "./notifications";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/preview", label: "Preview", icon: Receipt },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Sidebar({ groups, alerts, onNavigate, onOpenGroup }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-full flex-col px-3 py-4">
      <div className="flex h-8 items-center justify-between pl-2">
        <Link href="/" onClick={onNavigate}>
          <Brand />
        </Link>
        <Notifications alerts={alerts} className="hidden lg:flex" />
      </div>

      <nav className="mt-6 grid gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8.5 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink",
                active && "bg-surface font-medium text-ink shadow-card hover:bg-surface",
              )}
            >
              <Icon className="size-[1.5rem]" strokeWidth={1.75} />
              {label}
              {href === "/companies" && alerts.length > 0 && (
                <span className="ml-auto rounded-full bg-warning-soft px-1.5 text-2xs font-semibold text-warning tabular-nums">
                  {alerts.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {groups.length > 0 && (
        <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
          <p className="px-2.5 text-2xs font-medium text-ink-3">Groups</p>
          <div className="mt-1.5 grid gap-0.5">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  onNavigate?.();
                  onOpenGroup(group.id);
                }}
                className="flex h-7.5 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink"
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", group.attention ? "bg-amber" : "bg-ink-4")} />
                <span className="truncate">{group.name}</span>
                <span className="ml-auto text-xs text-ink-4 tabular-nums">{group.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2.5 px-2.5 pt-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-hover text-xs font-semibold text-ink-2">A</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-medium">Admin</p>
          <p className="text-2xs text-ink-3">Signed in</p>
        </div>
        <form action={logout}>
          <Tooltip label="Sign out">
            <button
              type="submit"
              aria-label="Sign out"
              className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <LogOut className="size-[1.4rem]" strokeWidth={1.75} />
            </button>
          </Tooltip>
        </form>
      </div>
    </div>
  );
}

export function AppShell({ groups, alerts, panels, today, currency, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-[24rem] shrink-0 lg:flex">
        <Sidebar groups={groups} alerts={alerts} onOpenGroup={setOpenGroup} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-13 shrink-0 items-center gap-2 px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex size-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover"
          >
            <MenuIcon className="size-[1.8rem]" strokeWidth={1.75} />
          </button>
          <Link href="/">
            <Brand />
          </Link>
          <Notifications alerts={alerts} align="end" className="ml-auto" />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} side="left" title="Menu" className="bg-ground">
        <Sidebar groups={groups} alerts={alerts} onNavigate={() => setMenuOpen(false)} onOpenGroup={setOpenGroup} />
      </Sheet>

      <GroupModal
        key={openGroup ?? "none"}
        panel={panels.find((panel) => panel.id === openGroup) ?? null}
        today={today}
        currency={currency}
        onClose={() => setOpenGroup(null)}
      />
    </div>
  );
}
