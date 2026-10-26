"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  Ellipsis,
  FolderInput,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuItem, MenuLabel, MenuSub } from "@/components/ui/menu";
import { DaysLeft, StatusBadge } from "@/components/ui/status";
import { Tooltip } from "@/components/ui/tooltip";
import { daysUntil, formatDate, formatTimestamp, relativeDays } from "@/lib/dates";
import { formatMoney, formatUsdt, priceOf, usdtOf } from "@/lib/money";
import { endFrom, serviceStates } from "@/lib/services";
import { cn } from "@/lib/utils";
import { CopyPassword } from "./copy-password";
import { SERVICE_ICONS } from "./service-table";

const meterTones = { ended: "bg-danger", renewal: "bg-amber", active: "bg-data", upcoming: "bg-data", unset: "bg-ink-4" };
const nextTones = { ended: "bg-danger-soft text-danger", renewal: "bg-warning-soft text-warning" };

function SectionTitle({ children }) {
  return <h3 className="mb-2 text-xs font-medium text-ink-3">{children}</h3>;
}

function Detail({ label, value, extra }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-ink-3">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-sm tabular-nums", value ? "text-ink" : "text-ink-4")}>{value || "Not set"}</dd>
      {extra && <dd>{extra}</dd>}
    </div>
  );
}

function CopyText({ value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Email copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the email");
    }
  }

  return (
    <Tooltip label="Copy email">
      <button type="button" onClick={copy} className="group/copy mt-0.5 flex max-w-full items-center gap-1.5 text-sm text-ink transition-colors hover:text-data">
      <span className="truncate">{value}</span>
        {copied ? (
          <Check className="size-[1.3rem] shrink-0 text-success" />
        ) : (
          <Copy className="size-[1.3rem] shrink-0 text-ink-4 group-hover/copy:text-data" />
        )}
      </button>
    </Tooltip>
  );
}

function NextUp({ state }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl px-3.5 py-3", nextTones[state.status] ?? "bg-sunken text-ink-2")}>
      <CalendarClock className="size-[1.7rem] shrink-0" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{relativeDays(state.days)}</p>
        <p className="text-xs opacity-80">
          {state.service.label} {state.days < 0 ? "ended" : "ends"} {formatDate(state.end, "EEE, d MMM yyyy")}
        </p>
      </div>
    </div>
  );
}

function ServiceCard({ state, company, pricing, today, timezone, pending, onRenew, onEdit, onCloseService, onReopenService }) {
  const price = priceOf(company, state.service, pricing);
  const { service, start, end, status } = state;
  const Icon = SERVICE_ICONS[service.key];
  const total = start && end ? daysUntil(end, start) : 0;
  const progress = total > 0 ? Math.min(1, Math.max(0, daysUntil(today, start) / total)) : null;

  return (
    <div className="rounded-xl bg-sunken/70 p-3.5">
      <div className="flex items-center gap-2">
        <Icon className="size-[1.4rem] text-ink-3" strokeWidth={1.75} />
        <span className="text-sm font-semibold">{service.label}</span>
        <StatusBadge status={status} className="ml-0.5" />
        <div className="ml-auto flex items-center gap-0.5">
          {status === "closed" ? (
            <Button variant="ghost" size="sm" onClick={() => onReopenService(service)} disabled={pending}>
              <ArchiveRestore /> Reopen
            </Button>
          ) : (
            <>
              {end ? (
                <Menu
                  trigger={
                    <Button variant="ghost" size="sm" disabled={pending}>
                      <CalendarPlus /> Renew
                    </Button>
                  }
                >
                  <MenuLabel>Renew for {service.term}</MenuLabel>
                  {(end === today ? [end] : [end, today]).map((start) => (
                    <MenuItem key={start} onSelect={() => onRenew(service, start)}>
                      {start === today ? "From today" : `From ${formatDate(start)}`}
                      <span className="ml-auto pl-4 text-xs text-ink-4 tabular-nums">
                        Until {formatDate(endFrom(service, start))}
                      </span>
                    </MenuItem>
                  ))}
                </Menu>
              ) : (
                <Button variant="ghost" size="sm" onClick={onEdit} disabled={pending}>
                  Add dates
                </Button>
              )}
              <Tooltip label={`Close ${service.label} and archive it`}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Close ${service.label} and archive it`}
                  onClick={() => onCloseService(service)}
                  disabled={pending}
                >
                  <Archive />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Detail label="Start date" value={formatDate(start)} />
        <Detail label={service.endLabel} value={formatDate(end)} extra={<DaysLeft state={state} />} />
        {price !== null && (
          <Detail
            label={`Renewal price ${service.cycle}`}
            value={formatMoney(price.amount, price.currency)}
            extra={<span className="text-xs text-data tabular-nums">{formatUsdt(usdtOf(price, pricing.rates))}</span>}
          />
        )}
      </dl>
      {status === "closed" && (
        <p className="mt-3 text-xs text-ink-3">Closed {formatTimestamp(state.closedAt, timezone)}</p>
      )}
      {progress !== null && status !== "closed" && (
        <div
          role="meter"
          aria-label="Share of the term used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="mt-3 h-1 overflow-hidden rounded-full bg-hover"
        >
          <div className={cn("h-full rounded-full", meterTones[status])} style={{ width: `${Math.max(progress * 100, 2)}%` }} />
        </div>
      )}
      {service.key === "rdp" && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs text-ink-3">Provider account</p>
            <div className="-my-1 flex items-center gap-0.5">
              {company.hasProviderPassword && <CopyPassword companyId={company.id} kind="provider" />}
              {company.hasPassword && <CopyPassword companyId={company.id} kind="key" />}
            </div>
          </div>
          {company.digirdpEmail ? <CopyText value={company.digirdpEmail} /> : <p className="mt-0.5 text-sm text-ink-4">Not set</p>}
          <p className="mt-1 text-2xs text-ink-4">
            Password {company.hasProviderPassword ? "saved" : "not set"} · RDP key {company.hasPassword ? "saved" : "not set"}
          </p>
        </div>
      )}
    </div>
  );
}

export function CompanyDetails({
  company,
  groups,
  history,
  rules,
  pricing,
  today,
  timezone,
  onClose,
  onEdit,
  onDelete,
  onMove,
  onRenew,
  onCloseService,
  onReopenService,
}) {
  const [confirming, setConfirming] = useState(false);
  const pending = company.id < 0;
  const states = serviceStates(company, today, rules);
  const next = states
    .filter((state) => state.days !== null && state.status !== "closed")
    .sort((a, b) => a.days - b.days)[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink-3">{company.groupName ?? "No group"}</p>
          <h2 className="mt-0.5 truncate text-lg font-semibold">{company.name}</h2>
          {company.website && (
            <a
              href={`https://${company.website}`}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex max-w-full items-center gap-1 text-sm text-ink-3 transition-colors hover:text-ink"
            >
              <span className="truncate">{company.website}</span>
              <ArrowUpRight className="size-[1.2rem] shrink-0" />
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="soft" size="sm" onClick={onEdit} disabled={pending}>
            <Pencil /> Edit
          </Button>
          <Menu
            label="More actions"
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="More actions" disabled={pending}>
                <Ellipsis />
              </Button>
            }
          >
            <MenuSub label="Move to group" icon={<FolderInput />}>
              {groups.map((group) => (
                <MenuItem key={group.id} onSelect={() => onMove(group.id)}>
                  <span className="truncate">{group.name}</span>
                  {group.id === company.groupId && <Check className="ml-auto" />}
                </MenuItem>
              ))}
              <MenuItem onSelect={() => onMove(null)}>
                No group
                {company.groupId === null && <Check className="ml-auto" />}
              </MenuItem>
            </MenuSub>
            <MenuItem danger onSelect={() => setConfirming(true)}>
              <Trash2 /> Delete company
            </MenuItem>
          </Menu>
          <Tooltip label="Close panel">
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
              <X />
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-6">
        {next && <NextUp state={next} />}

        <section>
          <SectionTitle>Services</SectionTitle>
          <div className="grid gap-2">
            {states.map((state) => (
              <ServiceCard
                key={state.service.key}
                state={state}
                company={company}
                pricing={pricing}
                today={today}
                timezone={timezone}
                pending={pending}
                onRenew={onRenew}
                onEdit={onEdit}
                onCloseService={onCloseService}
                onReopenService={onReopenService}
              />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Payment</SectionTitle>
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-sunken/70 p-3.5">
            <Detail label="Payment type" value={company.paymentType} />
            <Detail label="Payment method" value={company.paymentMethod} />
          </dl>
        </section>

        {company.notes && (
          <section>
            <SectionTitle>Notes</SectionTitle>
            <p className="rounded-xl bg-sunken/70 px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">{company.notes}</p>
          </section>
        )}

        {history.length > 0 && (
          <section>
            <SectionTitle>Previous names</SectionTitle>
            <ul className="grid gap-2 rounded-xl bg-sunken/70 p-3.5">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-ink">{entry.name}</span>
                  <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                    Changed {formatTimestamp(entry.changedAt, timezone)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {company.createdAt && (
          <p className="text-xs text-ink-4">
            Added {formatTimestamp(company.createdAt, timezone)} · Updated {formatTimestamp(company.updatedAt, timezone)}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${company.name}?`}
        description="This removes the company and its reminder history. It cannot be undone."
        confirmLabel="Delete company"
        onConfirm={onDelete}
      />
    </div>
  );
}
