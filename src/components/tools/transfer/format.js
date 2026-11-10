import { useEffect, useState } from "react";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function countdown(ms) {
  if (ms <= 0) return "now";
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`;
  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
}

export function timeAgo(time, now = Date.now()) {
  const ms = now - time;
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  return `${Math.floor(ms / DAY)}d ago`;
}

export const clock = (time) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function dayLabel(time) {
  const date = new Date(time);
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

export function duration(seconds) {
  if (!Number.isFinite(seconds)) return "…";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function device(userAgent = "") {
  const ua = userAgent ?? "";
  const browser =
    (/Edg\//.test(ua) && "Edge") ||
    (/OPR\//.test(ua) && "Opera") ||
    (/SamsungBrowser/.test(ua) && "Samsung Internet") ||
    (/Firefox\//.test(ua) && "Firefox") ||
    (/Chrome\//.test(ua) && "Chrome") ||
    (/Safari\//.test(ua) && "Safari") ||
    "Browser";
  const system =
    (/iPhone/.test(ua) && "iPhone") ||
    (/iPad/.test(ua) && "iPad") ||
    (/Android/.test(ua) && "Android") ||
    (/Windows/.test(ua) && "Windows") ||
    (/Mac OS X/.test(ua) && "macOS") ||
    (/Linux/.test(ua) && "Linux") ||
    "Unknown device";
  return `${browser} on ${system}`;
}

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

/** The current time, refreshed every 30 seconds, for countdowns and "5m ago" labels. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}
