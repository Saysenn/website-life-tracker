"use client";

import { useState } from "react";
import { formatTotals, formatUsdt } from "@/lib/money";
import { cn, plural } from "@/lib/utils";

export function SpendBars({ months, currency }) {
  const [active, setActive] = useState(null);
  const peak = Math.max(1, ...months.map((month) => month.dueUsdt + month.paidUsdt));

  return (
    <div>
      <div className="relative h-[15rem]">
        {[peak, peak / 2, 0].map((tick) => (
          <div key={tick} className="absolute inset-x-0 flex items-center" style={{ bottom: `${(tick / peak) * 100}%` }}>
            <span className="w-[4.5rem] translate-y-1/2 pr-2.5 text-right text-2xs text-ink-4 tabular-nums">
              {Math.round(tick)}
            </span>
            <span className="h-px flex-1 bg-grid" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-[4.5rem] flex items-end gap-2">
          {months.map((month, index) => {
            const isActive = active === month.key;
            return (
              <button
                key={month.key}
                type="button"
                onMouseEnter={() => setActive(month.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(month.key)}
                onBlur={() => setActive(null)}
                aria-label={`${month.full}: ${formatUsdt(month.dueUsdt)} to pay`}
                className="relative flex h-full flex-1 flex-col justify-end gap-0.5 outline-none"
              >
                {month.dueUsdt > 0 && (
                  <span
                    className={cn(
                      "mx-auto w-full max-w-[2.8rem] origin-bottom rounded-t-[4px] bg-data transition-opacity duration-150 animate-grow-y",
                      active && !isActive && "opacity-40",
                    )}
                    style={{ height: `${(month.dueUsdt / peak) * 100}%`, animationDelay: `${index * 60}ms` }}
                  />
                )}
                {month.paidUsdt > 0 && (
                  <span
                    className={cn(
                      "mx-auto w-full max-w-[2.8rem] origin-bottom rounded-b-[4px] bg-good transition-opacity duration-150 animate-grow-y",
                      month.dueUsdt === 0 && "rounded-t-[4px]",
                      active && !isActive && "opacity-40",
                    )}
                    style={{ height: `${(month.paidUsdt / peak) * 100}%`, animationDelay: `${index * 60}ms` }}
                  />
                )}
                {isActive && (
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-2 min-w-[15rem] rounded-lg bg-ink px-3 py-2 text-left text-ground shadow-float animate-pop",
                      index === 0 ? "left-0" : index === months.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    <span className="block text-2xs text-ground/60">{month.full}</span>
                    <span className="mt-1 block text-sm font-semibold tabular-nums">{formatUsdt(month.dueUsdt)} to pay</span>
                    <span className="block text-2xs text-ground/70 tabular-nums">
                      {formatTotals(month.dueTotals, currency)} · {plural(month.dueCount, "renewal")}
                    </span>
                    {month.paidUsdt > 0 && (
                      <span className="mt-1 block text-2xs text-ground/70 tabular-nums">Paid {formatUsdt(month.paidUsdt)}</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 ml-[4.5rem] flex gap-2">
        {months.map((month) => (
          <span key={month.key} className={cn("flex-1 text-center text-2xs text-ink-4", active === month.key && "text-ink")}>
            {month.label}
          </span>
        ))}
      </div>

      <div className="mt-3 ml-[4.5rem] flex items-center gap-4 text-2xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-data" /> To pay
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-good" /> Paid
        </span>
        <span className="ml-auto text-ink-4">USDT</span>
      </div>

      <table className="sr-only">
        <caption>Renewal spend per month in USDT</caption>
        <tbody>
          {months.map((month) => (
            <tr key={month.key}>
              <th scope="row">{month.full}</th>
              <td>{formatUsdt(month.dueUsdt)} to pay</td>
              <td>{formatUsdt(month.paidUsdt)} paid</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
