// All times are handled in Europe/Lisbon (PROMPT.md sections 1 & 15). We never
// call `new Date(string)` on a value without an explicit offset.

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const TIME_ZONE = "Europe/Lisbon";

/** UTC ISO instant -> "yyyy-MM-ddTHH:mm" wall time for <input type="datetime-local">. */
export function isoToLocalInput(iso: string): string {
  return formatInTimeZone(new Date(iso), TIME_ZONE, "yyyy-MM-dd'T'HH:mm");
}

/** "yyyy-MM-ddTHH:mm" Lisbon wall time from an input -> UTC ISO instant. */
export function localInputToIso(value: string): string {
  return fromZonedTime(value, TIME_ZONE).toISOString();
}

/**
 * First Sunday of the month = communion service (culto de ceia). Services are
 * always Sundays, so day-of-month <= 7 suffices.
 */
export function isFirstSundayOfMonth(dateIso: string): boolean {
  return Number(dateIso.slice(8, 10)) <= 7;
}

/** Human-readable range for display, e.g. "6 set 2026, 18:00–19:30". */
export function formatRange(startIso: string, endIso: string, allDay: boolean): string {
  if (allDay) return formatInTimeZone(new Date(startIso), TIME_ZONE, "d 'de' MMMM 'de' yyyy");
  const day = formatInTimeZone(new Date(startIso), TIME_ZONE, "d MMM yyyy");
  const start = formatInTimeZone(new Date(startIso), TIME_ZONE, "HH:mm");
  const end = formatInTimeZone(new Date(endIso), TIME_ZONE, "HH:mm");
  return `${day}, ${start}–${end}`;
}
