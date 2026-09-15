"use client";

import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { relativeDays } from "@/lib/dates";
import { formatMoney, formatUsdt } from "@/lib/money";
import { cn, plural } from "@/lib/utils";

const row = "grid grid-cols-[minmax(0,1fr)_8.5rem_9rem] items-baseline gap-x-3";

function byGroup(items) {
  const groups = {};

  for (const item of items) {
    const group = (groups[item.group] ??= { name: item.group, items: [], usdt: 0, fee: 0, currency: null, networks: {} });
    group.items.push(item);
    if (!item.price) continue;

    group.usdt += item.usdt;
    const network = item.paymentMethod || "Not set";
    const entry = (group.networks[network] ??= { count: 0, fee: false });
    entry.count += 1;
    if (item.gas) {
      entry.fee = true;
      group.fee += item.gas.amount;
      group.currency = item.gas.currency;
    }
  }

  return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
}

export function PaymentList({ items, rangeLabel }) {
  const [open, setOpen] = useState(false);
  const groups = byGroup(items);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "soft" })}>
        <ClipboardList /> Payment list
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Payment list"
        description={`${plural(items.length, "renewal")} · ${rangeLabel}`}
        className="max-w-[52rem]"
        autoFocus={false}
      >
        {groups.length ? (
          <div className="grid max-h-[62vh] gap-5 overflow-y-auto">
            {groups.map((group) => (
              <section key={group.name} className="grid gap-1.5">
                <p className="text-sm font-semibold">{group.name}</p>

                {group.items.map((item) => (
                  <div key={item.id} className={row}>
                    <span className="truncate text-xs text-ink-2">{item.company}</span>
                    <span className="text-right text-xs tabular-nums">
                      {item.price ? formatUsdt(item.usdt) : <span className="text-ink-4">No price</span>}
                    </span>
                    <span className={cn("text-right text-xs tabular-nums", item.days < 0 ? "text-danger" : "text-ink-3")}>
                      {relativeDays(item.days)}
                    </span>
                  </div>
                ))}

                <div className="my-0.5 h-px bg-grid" />

                <div className={row}>
                  <span className="text-xs font-medium">Total USDT needed</span>
                  <span className="text-right text-xs font-semibold tabular-nums">{formatUsdt(group.usdt)}</span>
                  <span aria-hidden />
                </div>

                <div className={row}>
                  <span className="text-xs font-medium">Total fee needed</span>
                  <span className="text-right text-xs font-semibold tabular-nums">
                    {group.currency ? formatMoney(group.fee, group.currency) : <span className="text-ink-4">Not set</span>}
                  </span>
                  <span className="text-right text-2xs text-ink-4">
                    {Object.entries(group.networks)
                      .map(([network, entry]) => `${network} ${entry.count}${entry.fee ? "" : ", no fee set"}`)
                      .join(" · ")}
                  </span>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-ink-3">Nothing to send in this window.</p>
        )}
      </Dialog>
    </>
  );
}
