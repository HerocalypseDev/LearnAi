// All deadlines and displayed times use Lagos time (WAT, UTC+1, no daylight saving).
export const TIME_ZONE = "Africa/Lagos";

export function formatDateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

// Lagos is UTC+1 all year, so the offset is fixed.
const LAGOS_OFFSET = "+01:00";

/** Split a stored timestamp into the values a date input and a time input expect, in Lagos time. */
export function toLagosInputs(iso: string | Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Turn "2026-10-07" + "21:00" (Lagos time) into a Date, or null if invalid. */
export function fromLagosInputs(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00${LAGOS_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whether a moment has passed (server components render once per request, so "now" is the request time). */
export function isPast(iso: string | Date): boolean {
  return new Date(iso).getTime() < Date.now();
}
