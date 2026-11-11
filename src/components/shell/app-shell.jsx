"use client";

import {
  Archive,
  BookOpen,
  Building2,
  ClipboardPaste,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/actions/auth";
import { Sheet } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Brand, BrandMark } from "./brand";
import { useTransferWatcher } from "@/components/tools/transfer/transfer-watcher";
import { GroupModal } from "./group-modal";
import { Notifications } from "./notifications";

// Read on the server in app/(app)/layout.jsx so the first paint already has the right width.
const SIDEBAR_COOKIE = "sidebar";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/preview", label: "Preview", icon: Receipt },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/import", label: "Import", icon: ClipboardPaste },
  { href: "/guides", label: "Guides", icon: BookOpen },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
];

const EASE = "ease-[cubic-bezier(0.2,0.9,0.3,1)]";

/** Text that fades and drifts left as the sidebar folds; on open it waits a beat for the width to lead. */
function fade(collapsed) {
  return cn(
    "whitespace-nowrap transition-[opacity,translate] duration-200",
    EASE,
    collapsed ? "pointer-events-none -translate-x-1.5 opacity-0" : "delay-100",
  );
}

/** A row that only exists in the folded sidebar, opening its height smoothly. */
function Reveal({ show, children }) {
  return (
    <div
      inert={!show}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300",
        EASE,
        show ? "grid-rows-[1fr] opacity-100 delay-75" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function Sidebar({ groups, alerts, transferUnread, collapsed = false, onToggle, onNavigate, onOpenGroup, className }) {
  const pathname = usePathname();
  const tip = (label) => (collapsed ? label : undefined);

  return (
    <div className={cn("flex h-full w-full flex-col px-3 py-4", className)}>
      <div className="flex h-8 items-center gap-1 pl-1">
        <div className="group/brand relative">
          <Link href="/" onClick={onNavigate} tabIndex={collapsed ? -1 : undefined} className="flex items-center gap-2">
            <BrandMark />
            <span className={cn("text-base font-semibold tracking-tight", fade(collapsed))}>Life Tracker</span>
          </Link>
          {onToggle && (
            <Tooltip label={tip("Expand sidebar · ⌘B")} side="right">
              <button
                type="button"
                onClick={onToggle}
                aria-label="Expand sidebar"
                tabIndex={collapsed ? undefined : -1}
                className={cn(
                  "absolute inset-y-0 left-0 flex w-6.5 items-center justify-center rounded-lg bg-hover text-ink transition-[opacity,scale] duration-200",
                  EASE,
                  collapsed
                    ? "scale-90 opacity-0 group-hover/brand:scale-100 group-hover/brand:opacity-100 focus-visible:scale-100 focus-visible:opacity-100"
                    : "pointer-events-none opacity-0",
                )}
              >
                <PanelLeftOpen className="size-[1.5rem]" strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}
        </div>
        <div className={cn("ml-auto flex items-center gap-0.5", onToggle && fade(collapsed))} inert={collapsed}>
          <Notifications alerts={alerts} className="hidden lg:flex" />
          {onToggle && (
            <Tooltip label="Collapse sidebar · ⌘B">
              <button
                type="button"
                onClick={onToggle}
                aria-label="Collapse sidebar"
                className="hidden size-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink lg:flex"
              >
                <PanelLeftClose className="size-[1.5rem]" strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {onToggle && (
        <Reveal show={collapsed}>
          <div className="pt-3 pl-[0.1rem]">
            <Notifications alerts={alerts} />
          </div>
        </Reveal>
      )}

      <nav className="mt-6 grid gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const badge =
            href === "/companies" && alerts.length > 0
              ? { count: alerts.length, tone: "bg-warning-soft text-warning", dot: "bg-warning" }
              : href === "/tools" && transferUnread > 0
                ? { count: transferUnread, tone: "bg-danger text-white", dot: "bg-danger" }
                : null;
          return (
            <Tooltip key={href} label={tip(label)} side="right">
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8.5 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink",
                  active && "bg-surface font-medium text-ink shadow-card hover:bg-surface",
                )}
              >
                <span className="relative shrink-0">
                  <Icon className="size-[1.5rem]" strokeWidth={1.75} />
                  {badge && (
                    <span
                      className={cn(
                        "absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-ground transition-[opacity,scale] duration-300",
                        EASE,
                        badge.dot,
                        collapsed ? "scale-100 opacity-100" : "scale-0 opacity-0",
                      )}
                    />
                  )}
                </span>
                <span className={fade(collapsed)}>{label}</span>
                {badge && (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-1.5 text-2xs font-semibold tabular-nums",
                      badge.tone,
                      fade(collapsed),
                    )}
                  >
                    {badge.count}
                  </span>
                )}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      {groups.length > 0 && (
        <div className="mt-7 min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <p className={cn("px-2.5 text-2xs font-medium text-ink-3", fade(collapsed))}>Groups</p>
          <div className="mt-1.5 grid gap-0.5">
            {groups.map((group) => (
              <Tooltip key={group.id} label={tip(group.name)} side="right">
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.();
                    onOpenGroup(group.id);
                  }}
                  className="flex h-7.5 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                >
                  <span className="flex w-[1.5rem] shrink-0 justify-center">
                    <span
                      className={cn(
                        "size-1.5 rounded-full transition-[scale] duration-300",
                        EASE,
                        group.attention ? "bg-amber" : "bg-ink-4",
                        collapsed && "scale-125",
                      )}
                    />
                  </span>
                  <span className={cn("truncate", fade(collapsed))}>{group.name}</span>
                  <span className={cn("ml-auto text-xs text-ink-4 tabular-nums", fade(collapsed))}>{group.count}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto pt-4">
        {onToggle && (
          <Reveal show={collapsed}>
            <form action={logout} className="pb-2 pl-[0.3rem]">
              <Tooltip label="Sign out" side="right">
                <button
                  type="submit"
                  aria-label="Sign out"
                  className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                >
                  <LogOut className="size-[1.4rem]" strokeWidth={1.75} />
                </button>
              </Tooltip>
            </form>
          </Reveal>
        )}
        <div className="flex items-center gap-2.5 px-1">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-hover text-xs font-semibold text-ink-2">A</span>
          <div className={cn("min-w-0 flex-1 leading-tight", fade(collapsed))}>
            <p className="text-sm font-medium">Admin</p>
            <p className="text-2xs text-ink-3">Signed in</p>
          </div>
          <form action={logout} className={fade(collapsed)} inert={collapsed}>
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
    </div>
  );
}

export function AppShell({ groups, alerts, panels, today, currency, initialCollapsed = false, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const transferUnread = useTransferWatcher(usePathname());

  const toggle = () =>
    setCollapsed((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });

  useEffect(() => {
    const onKey = (event) => {
      if (event.key.toLowerCase() !== "b" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        data-collapsed={collapsed || undefined}
        className={cn(
          "hidden shrink-0 overflow-hidden transition-[width] duration-300 lg:flex",
          EASE,
          collapsed ? "w-[5.9rem]" : "w-[24rem]",
        )}
      >
        <Sidebar
          groups={groups}
          alerts={alerts}
          transferUnread={transferUnread}
          collapsed={collapsed}
          onToggle={toggle}
          onOpenGroup={setOpenGroup}
          className="w-[24rem] shrink-0"
        />
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
        <Sidebar
          groups={groups}
          alerts={alerts}
          transferUnread={transferUnread}
          onNavigate={() => setMenuOpen(false)}
          onOpenGroup={setOpenGroup}
        />
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
