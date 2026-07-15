// GET /share/{serviceId}?ministry=all|slug&sig=... — public, self-contained
// HTML page with the order of service, for sharing in WhatsApp/email.
//
// No token: access is gated by an HMAC signature generated via
// GET /services/{id}/share-link (authenticated). A link only ever exposes the
// one service (and optionally one ministry) it was signed for.

import { serviceClient } from "../_shared/supabase.ts";
import { shareSignature } from "../_shared/crypto.ts";
import { buildDetail, isFirstSundayOfMonth, type ServiceDetail } from "../_shared/service-detail.ts";
import { HttpError, errorResponse, pathSegments, preflight } from "../_shared/http.ts";

function esc(text: unknown): string {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDatePt(dateIso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

const MOMENT_LABEL: Record<string, string> = {
  abertura: "Abertura",
  adoracao: "Adoração",
  ceia: "Ceia",
  final: "Final",
  outro: "Outro",
};

type Min = ServiceDetail["ministries"][number];

// Communion roles ("Ceia", "Partilha da Ceia") only exist on first Sundays.
function isCeiaRole(name: string): boolean {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .includes("ceia");
}

function rosterHtml(detail: ServiceDetail, m: Min, isCeia: boolean): string {
  const roles = detail.ministry_roles
    .filter((r) => r.ministry_id === m.id && (isCeia || !isCeiaRole(r.name as string)))
    .map((r) => r.name as string);
  // Legacy assignments whose role is no longer in the editable list still show.
  for (const a of detail.assignments) {
    if (a.ministry_id === m.id && !roles.includes(a.role as string)) roles.push(a.role as string);
  }
  if (roles.length === 0) return "";
  const rows = roles
    .map((role) => {
      const names = detail.assignments
        .filter((a) => a.ministry_id === m.id && a.role === role && a.person_name)
        .map((a) => esc(a.person_name));
      return `<tr><td class="k">${esc(role)}</td><td>${names.length ? names.join(", ") : '<span class="empty">—</span>'}</td></tr>`;
    })
    .join("");
  return `<section><h2><span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)}</h2><table>${rows}</table></section>`;
}

function songsHtml(detail: ServiceDetail): string {
  if (detail.songs.length === 0) return "";
  const items = detail.songs
    .map((s) => {
      const extra = [s.song_key, s.author].filter(Boolean).map(esc).join(" · ");
      const moment = MOMENT_LABEL[s.moment as string] ?? s.moment;
      return `<li>${esc(s.title)}${extra ? ` <span class="muted">(${extra})</span>` : ""} <span class="tag">${esc(moment)}</span></li>`;
    })
    .join("");
  return `<section><h2>Músicas</h2><ol>${items}</ol></section>`;
}

function ebdHtml(detail: ServiceDetail): string {
  const lesson = detail.service.ebd_theme || detail.service.ebd_notes;
  const rows = detail.ebd_classes
    .map((c) => {
      const names = detail.ebd_assignments
        .filter((a) => a.ebd_class_id === c.id && a.person_name)
        .map((a) => esc(a.person_name));
      return `<tr><td class="k">${esc(c.name)}</td><td>${names.length ? names.join(", ") : '<span class="empty">—</span>'}</td></tr>`;
    })
    .join("");
  const lessonHtml = lesson
    ? `<table>${detail.service.ebd_theme ? `<tr><td class="k">Tema da lição</td><td>${esc(detail.service.ebd_theme)}</td></tr>` : ""}${detail.service.ebd_notes ? `<tr><td class="k">Notas</td><td>${esc(detail.service.ebd_notes)}</td></tr>` : ""}</table>`
    : "";
  if (!lessonHtml && detail.ebd_classes.length === 0) return "";
  return `<section><h2>Escola Bíblica Dominical</h2>${lessonHtml}${rows ? `<table>${rows}</table>` : ""}</section>`;
}

// The liturgy outline, matching the app: Boas vindas · Louvor · Leitura e
// oração · Pregação [· Ceia] · Louvor · Oferta · Anúncios · Despedida.
function liturgyHtml(detail: ServiceDetail, isCeia: boolean): string {
  const momentOf = (key: string) => detail.moments.find((m) => m.moment === key);
  const songNames = (moments: string[]) =>
    detail.songs.filter((s) => moments.includes(s.moment as string)).map((s) => esc(s.title));

  const step = (title: string, detailHtml: string) =>
    `<li><span class="st">${esc(title)}</span>${detailHtml ? `<div class="sd">${detailHtml}</div>` : ""}</li>`;

  const momentStep = (key: string, label: string) => {
    const m = momentOf(key);
    const bits = [
      m?.person_name ? esc(m.person_name) : '<span class="empty">—</span>',
      m?.scripture ? `· ${esc(m.scripture)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const notes = m?.notes ? `<div class="note">${esc(m.notes)}</div>` : "";
    return step(label, bits + notes);
  };

  const songsStep = (moments: string[]) => {
    const names = songNames(moments);
    return step(
      "Louvor e adoração",
      names.length ? `<ol class="songs">${names.map((n) => `<li>${n}</li>`).join("")}</ol>` : '<span class="empty">— sem músicas —</span>',
    );
  };

  const s = detail.service;
  const sermon = [
    s.preacher_name && `<tr><td class="k">Pregador</td><td>${esc(s.preacher_name)}</td></tr>`,
    s.theme && `<tr><td class="k">Tema</td><td>${esc(s.theme)}</td></tr>`,
    s.scripture && `<tr><td class="k">Texto</td><td>${esc(s.scripture)}</td></tr>`,
    s.scripture_aux && `<tr><td class="k">Textos aux.</td><td>${esc(s.scripture_aux)}</td></tr>`,
  ]
    .filter(Boolean)
    .join("");

  const communionPeople = (() => {
    const presb = detail.ministries.find((m) => m.slug === "presbiterio");
    return detail.assignments
      .filter((a) => a.ministry_id === presb?.id && a.person_name)
      .map((a) => esc(a.person_name))
      .join(", ");
  })();

  const steps = [
    momentStep("boas_vindas", "Boas vindas"),
    songsStep(["abertura", "adoracao"]),
    momentStep("leitura_oracao", "Leitura e oração"),
    step("Pregação", sermon ? `<table>${sermon}</table>` : '<span class="empty">—</span>'),
    ...(isCeia ? [step("Ceia", communionPeople || '<span class="empty">—</span>')] : []),
    songsStep(["final", "outro"]),
    momentStep("oferta", "Oferta"),
    momentStep("anuncios", "Anúncios"),
    momentStep("despedida", "Despedida"),
  ].join("");

  return `<section><h2>Ordem do culto</h2><ol class="liturgy">${steps}</ol></section>`;
}

function pageHtml(detail: ServiceDetail, ministryFilter: string): string {
  const s = detail.service;
  const isCeia = isFirstSundayOfMonth(s.service_date as string);
  const bySlug = new Map(detail.ministries.map((m) => [m.slug as string, m]));
  const only = ministryFilter === "all" ? null : bySlug.get(ministryFilter) ?? null;

  const headerRows = ""; // the liturgy below carries the sermon detail

  const sections: string[] = [];
  // Data-driven: any ministry with roles gets a block; EBD is its own block and
  // the Presbitério (Partilha da Ceia) only shows on communion Sundays.
  const withRoles = new Set(detail.ministry_roles.map((r) => r.ministry_id as string));
  const rosterMinistries = detail.ministries.filter(
    (m) =>
      withRoles.has(m.id as string) &&
      m.slug !== "ebd" &&
      m.slug !== "culto" &&
      (m.slug !== "presbiterio" || isCeia),
  );

  // Full share leads with the liturgy; scoped shares go straight to the ministry.
  if (!only) sections.push(liturgyHtml(detail, isCeia));

  if (only) {
    if (only.slug === "louvor") sections.push(songsHtml(detail));
    if (only.slug === "ebd") {
      if (!isCeia) sections.push(ebdHtml(detail));
    } else {
      sections.push(rosterHtml(detail, only, isCeia));
    }
  } else {
    if (bySlug.get("louvor")) sections.push(songsHtml(detail));
    for (const m of rosterMinistries) sections.push(rosterHtml(detail, m, isCeia));
    if (!isCeia) sections.push(ebdHtml(detail));
  }

  const title = `${isCeia ? "Culto de Ceia" : "Culto"} — ${formatDatePt(s.service_date as string)}`;
  const subtitle = only ? ` · ${esc(only.name)}` : "";

  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f6f6f4; color: #1c1c1c; padding: 16px; }
  main { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 1.25rem; text-transform: capitalize; }
  .sub { color: #666; font-size: .9rem; margin: 4px 0 16px; }
  .badge { display: inline-block; background: #fef3c7; color: #92400e; border-radius: 999px; padding: 2px 10px; font-size: .75rem; font-weight: 600; vertical-align: middle; margin-left: 6px; }
  section { background: #fff; border: 1px solid #e4e4e0; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
  h2 { font-size: .95rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  td { padding: 3px 0; vertical-align: top; }
  td.k { color: #777; width: 8.5rem; padding-right: 10px; }
  ol { padding-left: 1.2rem; font-size: .9rem; } li { margin: 3px 0; }
  ol.liturgy { padding-left: 1.4rem; } ol.liturgy > li { margin: 10px 0; }
  .st { font-weight: 600; } .sd { margin-top: 2px; color: #555; }
  .sd table { margin-top: 2px; } ol.songs { margin: 2px 0 0; padding-left: 1rem; }
  .note { margin-top: 2px; font-size: .85em; color: #777; }
  .muted { color: #888; } .empty { color: #bbb; }
  .tag { font-size: .7rem; background: #eee; border-radius: 999px; padding: 1px 8px; color: #555; }
  footer { text-align: center; color: #999; font-size: .75rem; margin-top: 20px; }
  @media (prefers-color-scheme: dark) {
    body { background: #161616; color: #ececec; }
    section { background: #1f1f1f; border-color: #333; }
    td.k { color: #9a9a9a; } .sub { color: #9a9a9a; }
    .sd { color: #b5b5b5; } .note { color: #8f8f8f; }
    .tag { background: #333; color: #bbb; } .empty { color: #555; }
    .badge { background: #453006; color: #fcd34d; }
  }
</style>
</head>
<body>
<main>
  <h1>${esc(formatDatePt(s.service_date as string))}${isCeia ? '<span class="badge">Culto de Ceia</span>' : ""}</h1>
  <p class="sub">às ${esc(String(s.service_time).slice(0, 5))}${subtitle}</p>
  ${headerRows ? `<section><table>${headerRows}</table></section>` : ""}
  ${sections.filter(Boolean).join("\n")}
  <footer>Igreja Evangélica de Lisboa</footer>
</main>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    if (req.method !== "GET") throw new HttpError(405, "method not allowed");
    const seg = pathSegments(req, "share");
    const id = seg[0];
    if (!id) throw new HttpError(404, "not found");
    const url = new URL(req.url);
    const ministry = url.searchParams.get("ministry") ?? "all";
    const sig = url.searchParams.get("sig") ?? "";

    const expected = await shareSignature(id, ministry);
    if (sig.length !== expected.length || sig !== expected) {
      throw new HttpError(403, "invalid share link");
    }

    const db = serviceClient();
    const detail = await buildDetail(db, id);
    return new Response(pageHtml(detail, ministry), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    return errorResponse(req, err);
  }
});
