// GET /ics?token={token}&ministry={slug|all} — iCalendar feed (PROMPT.md §6).
//
// This is the main channel for volunteers: they have no Microsoft licence, so
// they subscribe to this URL in Google Calendar or on their phone. Calendar
// clients cannot send custom headers, so the token travels in the query string
// (resolveIdentity already accepts ?token=). Issue dedicated readonly tokens
// for this and never log the URL.
//
// The feed contains events (optionally filtered by ministry) plus the Sunday
// services, from 60 days in the past to ~13 months ahead.

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, errorResponse, preflight } from "../_shared/http.ts";

const PRODID = "-//IEL Calendario//PT";
const UID_DOMAIN = "iel-calendario";

// RFC 5545 text escaping.
function esc(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

// RFC 5545 line folding: max 75 octets per line, continuation prefixed by space.
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let currentLen = 0;
  const limit = () => (out.length === 0 ? 75 : 74); // continuations start with a space
  for (const ch of line) {
    const chLen = new TextEncoder().encode(ch).length;
    if (currentLen + chLen > limit()) {
      out.push(current);
      current = "";
      currentLen = 0;
    }
    current += ch;
    currentLen += chLen;
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", "");
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Europe/Lisbon wall time -> UTC instant. The offset at the same wall time
// interpreted as UTC is a good first guess; services at 10:30 are never inside
// the 01:00–02:00 DST switch window, so one pass is enough.
function lisbonToUtc(date: string, time: string): Date {
  const guess = new Date(`${date}T${time.length === 5 ? time + ":00" : time}Z`);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Lisbon", timeZoneName: "longOffset" });
  const tzName = fmt.formatToParts(guess).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tzName.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMin = m ? (m[1] === "+" ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(guess.getTime() - offsetMin * 60_000);
}

const ICS_STATUS: Record<string, string> = {
  proposta: "TENTATIVE",
  confirmada: "CONFIRMED",
  cancelada: "CANCELLED",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    if (req.method !== "GET") throw new HttpError(405, "method not allowed");
    const identity = await requireIdentity(req); // reads ?token=
    enforceRateLimit(identity.rateKey);
    const db = serviceClient();
    const url = new URL(req.url);
    const ministryParam = url.searchParams.get("ministry") ?? "all";

    const now = new Date();
    const from = new Date(now.getTime() - 60 * 86400_000).toISOString();
    const to = new Date(now.getTime() + 400 * 86400_000).toISOString();

    let ministryFilter: string | null = null;
    let calName = "Calendário IEL";
    if (ministryParam !== "all") {
      const { data: ministry } = await db
        .from("ministries")
        .select("id, name")
        .eq("slug", ministryParam)
        .maybeSingle();
      if (!ministry) throw new HttpError(404, `unknown ministry: ${ministryParam}`);
      ministryFilter = ministry.id as string;
      calName = `IEL — ${ministry.name}`;
    }

    let eventsQuery = db
      .from("events")
      .select("id, ministry_id, title, description, starts_at, ends_at, all_day, location, status, updated_at")
      .gte("ends_at", from)
      .lte("starts_at", to);
    if (ministryFilter) eventsQuery = eventsQuery.eq("ministry_id", ministryFilter);

    const [events, services, ministries] = await Promise.all([
      eventsQuery.order("starts_at"),
      db
        .from("services")
        .select("id, service_date, service_time, label, theme, scripture")
        .gte("service_date", from.slice(0, 10))
        .lte("service_date", to.slice(0, 10))
        .order("service_date"),
      db.from("ministries").select("id, name"),
    ]);
    const ministryName = new Map((ministries.data ?? []).map((m) => [m.id as string, m.name as string]));

    const stamp = utcStamp(now.toISOString());
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:${PRODID}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${esc(calName)}`,
      "X-WR-TIMEZONE:Europe/Lisbon",
    ];

    for (const e of events.data ?? []) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${e.id}@${UID_DOMAIN}`);
      lines.push(`DTSTAMP:${stamp}`);
      if (e.all_day) {
        lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.starts_at)}`);
        // DTEND is exclusive for all-day events.
        lines.push(`DTEND;VALUE=DATE:${dateOnly(addDays(e.ends_at, 1))}`);
      } else {
        lines.push(`DTSTART:${utcStamp(e.starts_at)}`);
        lines.push(`DTEND:${utcStamp(e.ends_at)}`);
      }
      const prefix = ministryFilter ? "" : `[${ministryName.get(e.ministry_id) ?? "?"}] `;
      lines.push(`SUMMARY:${esc(prefix + e.title)}`);
      if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
      if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
      lines.push(`STATUS:${ICS_STATUS[e.status] ?? "CONFIRMED"}`);
      lines.push(`LAST-MODIFIED:${utcStamp(e.updated_at)}`);
      lines.push("END:VEVENT");
    }

    // Sunday services: part of every feed — the culto belongs to everyone.
    for (const s of services.data ?? []) {
      const start = lisbonToUtc(s.service_date, s.service_time);
      const end = new Date(start.getTime() + 120 * 60_000); // culto 10:30–12:30
      // First Sunday of the month = communion service.
      const isCeia = Number(s.service_date.slice(8, 10)) <= 7;
      const title = s.label?.trim() || (isCeia ? "Culto de Ceia" : "Culto");
      const detail = [s.theme && `Tema: ${s.theme}`, s.scripture && `Texto: ${s.scripture}`]
        .filter(Boolean)
        .join("\n");
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${s.id}@${UID_DOMAIN}`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART:${utcStamp(start.toISOString())}`);
      lines.push(`DTEND:${utcStamp(end.toISOString())}`);
      lines.push(`SUMMARY:${esc(s.theme ? `${title} — ${s.theme}` : title)}`);
      if (detail) lines.push(`DESCRIPTION:${esc(detail)}`);
      lines.push("STATUS:CONFIRMED");
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    const body = lines.map(fold).join("\r\n") + "\r\n";

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders(req.headers.get("origin")),
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="iel-calendario.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(req, err);
  }
});
