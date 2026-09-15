"use client";

import { useState } from "react";
import { cn, plural } from "@/lib/utils";

const breakdown = (point) =>
  Object.entries(point.byGroup)
    .map(([name, entry]) => ({
      name,
      count: entry.count,
      services: Object.entries(entry.services)
        .map(([label, count]) => `${label} ${count}`)
        .join(" · "),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

export function RenewalsLine({ points }) {
  const [active, setActive] = useState(null);
  const peak = Math.max(1, ...points.map((point) => point.count));
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    ...point,
    x: index * step,
    y: 88 - (point.count / peak) * 76,
  }));
  const line = coords.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const current = active === null ? null : coords[active];

  return (
    <div>
      <div className="relative h-[12rem]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <path d={`${line} L100,100 L0,100 Z`} fill="var(--color-data)" fillOpacity="0.1" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-data)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {current && <span className="absolute inset-y-0 w-px bg-grid" style={{ left: `${current.x}%` }} />}

        {coords.map((point, index) => (
          <span
            key={point.key}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            <span
              className={cn(
                "block size-2.5 rounded-full bg-data ring-2 ring-surface transition-transform duration-150",
                active === index && "scale-150",
              )}
            />
            {point.count > 0 && (
              <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 text-2xs font-medium text-ink-2 tabular-nums">
                {point.count}
              </span>
            )}
          </span>
        ))}

        {coords.map((point, index) => {
          const left = Math.max(0, point.x - step / 2);
          return (
            <button
              key={point.key}
              type="button"
              aria-label={`${point.full}: ${plural(point.count, "renewal")}`}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className="absolute inset-y-0 outline-none"
              style={{ left: `${left}%`, width: `${Math.min(100, point.x + step / 2) - left}%` }}
            />
          );
        })}

        {current && (
          <span
            className={cn(
              "pointer-events-none absolute z-10 w-[20rem] max-w-full rounded-lg bg-ink px-3 py-2 text-ground shadow-float animate-pop",
              current.y < 50 ? "bottom-0" : "top-0",
              active === 0 ? "left-0" : active === coords.length - 1 ? "right-0" : "-translate-x-1/2",
            )}
            style={active === 0 || active === coords.length - 1 ? undefined : { left: `${current.x}%` }}
          >
            <span className="block text-2xs text-ground/60">{current.full}</span>
            <span className="mt-1 block text-sm font-semibold tabular-nums">{plural(current.count, "renewal")}</span>
            {breakdown(current).map((group) => (
              <span key={group.name} className="mt-1 flex items-baseline justify-between gap-3 text-2xs">
                <span className="min-w-0 truncate text-ground/80">
                  {group.name}
                  <span className="text-ground/50"> · {group.services}</span>
                </span>
                <span className="shrink-0 tabular-nums">{group.count}</span>
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="relative mt-3 h-[1.4rem]">
        {coords.map((point, index) => {
          const first = index === 0;
          const last = index === coords.length - 1;
          return (
            <span
              key={point.key}
              className={cn(
                "absolute top-0 text-2xs",
                active === index ? "text-ink" : "text-ink-4",
                first && "left-0",
                last && "right-0",
                !first && !last && "-translate-x-1/2",
              )}
              style={first || last ? undefined : { left: `${point.x}%` }}
            >
              {point.label}
            </span>
          );
        })}
      </div>

      <table className="sr-only">
        <caption>Renewals due per month</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.full}</th>
              <td>{plural(point.count, "renewal")}</td>
              <td>{breakdown(point).map((group) => `${group.name} ${group.count}`).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
