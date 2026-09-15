import { formatAmount, formatUsdt } from "@/lib/money";

export const SLICE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];

const RADIUS = 42;
const STROKE = 11;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function GroupDonut({ slices }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const arcs = slices.reduce((list, slice) => {
    const previous = list[list.length - 1];
    return [
      ...list,
      { ...slice, length: (slice.value / total) * CIRCUMFERENCE, offset: previous ? previous.offset + previous.length : 0 },
    ];
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg viewBox="0 0 120 120" className="size-[15rem] -rotate-90">
          <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--color-sunken)" strokeWidth={STROKE} />
          {arcs.map((arc, index) => {
            const visible = Math.max(arc.length - 2, 0.5);
            return (
              <circle
                key={arc.name}
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                stroke={SLICE_COLORS[index % SLICE_COLORS.length]}
                strokeWidth={STROKE}
                strokeDasharray={`${visible} ${CIRCUMFERENCE - visible}`}
                strokeDashoffset={-arc.offset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          <span className="text-2xs text-ink-3">This month</span>
          <span className="text-lg font-semibold tabular-nums">{formatAmount(total)}</span>
          <span className="text-2xs text-ink-4">USDT</span>
        </div>
      </div>

      <ul className="grid w-full min-w-0 gap-2.5">
        {slices.map((slice, index) => (
          <li key={slice.name} className="flex items-baseline gap-2 text-sm">
            <span
              className="size-2 shrink-0 translate-y-0.5 rounded-full"
              style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }}
            />
            <span className="truncate text-ink-2">{slice.name}</span>
            <span className="ml-auto shrink-0 tabular-nums">
              {formatUsdt(slice.value)}
              <span className="text-ink-4"> · {Math.round((slice.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
