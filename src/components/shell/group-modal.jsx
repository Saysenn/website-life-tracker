"use client";

import { Archive, CalendarCheck } from "lucide-react";
import { startTransition, useMemo, useOptimistic } from "react";
import { toast } from "sonner";
import { closeService, reopenService, setServiceDates } from "@/actions/companies";
import { CopyPassword } from "@/components/companies/copy-password";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status";
import { Tooltip } from "@/components/ui/tooltip";
import { daysUntil, formatDate, relativeDays } from "@/lib/dates";
import { panelTotals } from "@/lib/group-panel";
import { formatMoney, formatTotals, formatUsdt } from "@/lib/money";
import { BILLABLE, endFrom, termOf } from "@/lib/services";
import { cn, plural } from "@/lib/utils";

const service = BILLABLE[0];
const tones = { rebuy: "text-danger", suspended: "text-serious", ended: "text-danger", renewal: "text-warning" };

const grid =
  "grid grid-cols-[minmax(0,1fr)_8.5rem_5.4rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_8rem_7.5rem_8.5rem_5.4rem]";

function reducer(rows, action) {
  if (action.type === "remove") return rows.filter((row) => row.id !== action.id);
  return rows.map((row) =>
    row.id === action.id ? { ...row, start: action.start, end: action.end, days: action.days, status: "renewed" } : row,
  );
}

function RowAction({ label, onClick, children }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex size-6.5 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-hover hover:text-ink [&_svg]:size-[1.4rem]"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Summary({ label, hint, value, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="truncate text-xs text-ink-2">{label}</span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="hidden text-2xs text-ink-4 tabular-nums sm:inline">{hint}</span>
        <span className={cn("w-[8rem] text-right text-xs tabular-nums", tone ?? "text-ink")}>{value}</span>
      </span>
    </div>
  );
}

export function GroupModal({ panel, today, currency, onClose }) {
  const [rows, applyRows] = useOptimistic(panel?.rows ?? [], reducer);
  const totals = useMemo(() => panelTotals(rows, today), [rows, today]);

  function renew(row) {
    const end = endFrom(service, today, termOf(row.start, row.end, service));
    startTransition(async () => {
      applyRows({ type: "renew", id: row.id, start: today, end, days: daysUntil(end, today) });
      const result = await setServiceDates(row.id, service.key, { start: today, end });
      if (result.ok) toast.success(`${row.name} renewed until ${formatDate(end)}`);
      else toast.error(result.error);
    });
  }

  function close(row) {
    startTransition(async () => {
      applyRows({ type: "remove", id: row.id });
      const result = await closeService(row.id, service.key);
      if (result.ok) {
        toast.success(`${row.name} RDP moved to the archive`, {
          action: { label: "Undo", onClick: () => reopenService(row.id, service.key) },
        });
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog
      open={Boolean(panel)}
      onOpenChange={(next) => !next && onClose()}
      title={panel?.name ?? "Group"}
      description={`${plural(rows.length, "company", "companies")} with an RDP`}
      className="max-w-[64rem]"
      autoFocus={false}
    >
      {rows.length ? (
        <div className="grid gap-3">
          <ul className="-mx-2 max-h-[34rem] overflow-y-auto">
            <li className={cn(grid, "sticky top-0 z-10 bg-surface px-2 pb-1.5 text-2xs text-ink-4")}>
              <span>Company</span>
              <span className="hidden sm:block">Renewal</span>
              <span className="hidden sm:block">Status</span>
              <span className="text-right">To send</span>
              <span aria-hidden />
            </li>

            {rows.map((row) => (
              <li key={row.id} className={cn(grid, "rounded-lg px-2 py-2 transition-colors hover:bg-sunken")}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{row.name}</p>
                  {row.account && <p className="truncate text-2xs text-ink-3">{row.account}</p>}
                </div>

                <div className="hidden min-w-0 sm:block">
                  <p className="truncate text-xs text-ink-2 tabular-nums">{row.end ? formatDate(row.end) : "Not set"}</p>
                  <p className={cn("truncate text-2xs", tones[row.status] ?? "text-ink-3")}>
                    {row.days === null ? "No date yet" : relativeDays(row.days)}
                  </p>
                </div>

                <StatusBadge status={row.status} className="hidden h-5 px-1.5 text-2xs sm:inline-flex" />

                <div className="min-w-0 text-right">
                  <p className="truncate text-xs tabular-nums">
                    {row.price ? formatUsdt(row.usdt) : <span className="text-ink-4">No price</span>}
                  </p>
                  {row.gas && (
                    <p className="truncate text-2xs text-ink-4 tabular-nums">
                      {formatMoney(row.gas.amount, row.gas.currency)} gas
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-0.5">
                  {row.hasProviderPassword && <CopyPassword companyId={row.id} kind="provider" />}
                  {row.hasPassword && <CopyPassword companyId={row.id} />}
                  <RowAction label="RDP renewed today" onClick={() => renew(row)}>
                    <CalendarCheck />
                  </RowAction>
                  <RowAction label="Close and archive" onClick={() => close(row)}>
                    <Archive />
                  </RowAction>
                </div>
              </li>
            ))}
          </ul>

          <div className="ml-auto w-full rounded-xl bg-sunken p-3 sm:max-w-[34rem]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-ink">Total this month</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="hidden text-2xs text-ink-4 tabular-nums sm:inline">
                  {formatTotals(totals.raw, currency)} · {plural(totals.count, "renewal")}
                </span>
                <span className="w-[8rem] text-right text-sm font-semibold tabular-nums">{formatUsdt(totals.usdt)}</span>
              </span>
            </div>

            <div className="my-2.5 h-px bg-grid" />

            <div className="grid gap-1.5">
              <Summary
                tone="text-success"
                label="Spent on renewals"
                hint={`${formatTotals(totals.paidRaw, currency)} · ${plural(totals.paidCount, "renewal")}`}
                value={formatUsdt(totals.paid)}
              />
              <Summary
                label="Remaining to pay"
                hint={`${formatTotals(totals.dueRaw, currency)} · ${plural(totals.dueCount, "renewal")}`}
                value={formatUsdt(totals.due)}
              />
              {Object.keys(totals.gas).length ? (
                Object.entries(totals.gas).map(([network, gas]) => (
                  <Summary
                    key={network}
                    label={`Gas, ${network}`}
                    hint={plural(gas.transfers, "transfer")}
                    value={gas.currency ? formatMoney(gas.amount, gas.currency) : "Not set"}
                  />
                ))
              ) : (
                <Summary label="Gas needed" value="Nothing to send" tone="text-ink-3" />
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-ink-3">No RDPs in this group yet.</p>
      )}
    </Dialog>
  );
}
