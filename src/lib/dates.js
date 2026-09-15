import { addMonths, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

export function todayIn(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return format(new Date(), "yyyy-MM-dd");
  }
}

export const toISODate = (date) => format(date, "yyyy-MM-dd");
export const utcStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");
export const parseDate = (value) => parseISO(value);
export const isISODate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));
export const daysUntil = (date, today) => differenceInCalendarDays(parseISO(date), parseISO(today));
export const shiftMonths = (date, months) => toISODate(addMonths(parseISO(date), months));

export function formatDate(value, pattern = "d MMM yyyy") {
  return value ? format(parseISO(value), pattern) : "";
}

export function formatTimestamp(value, timeZone) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value: part }) => [type, part]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

export function relativeDays(days) {
  if (days === null || days === undefined) return "";
  if (days < 0) return days === -1 ? "1 day overdue" : `${-days} days overdue`;
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  if (days <= 60) return `${days} days left`;
  const months = Math.round(days / 30.44);
  return months < 24 ? `${months} months left` : `${Math.round(days / 365)} years left`;
}
