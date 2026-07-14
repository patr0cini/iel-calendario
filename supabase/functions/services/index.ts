// /services (PROMPT.md sections 6 & 10).
//   GET ?year=YYYY            -> list service headers for a year (any scope)
//   GET ?date=YYYY-MM-DD      -> full detail for the service on that date
//   GET /{id}                 -> full detail by id
//   POST                      -> create a service (admin)
//   PATCH /{id}               -> edit header: theme/scripture/preacher/leader… (admin)
//   POST /generate {year}     -> generate_sundays(year) (admin)
//   PUT /{id}/assignments?ministry=slug  -> replace that ministry's roster (admin or own ministry)
//   PUT /{id}/songs                      -> replace songs (admin or Louvor)
//   PUT /{id}/ebd?class=classId          -> replace one EBD class roster (admin or EBD)
//
// Detail embeds resolved person names and the list of people unavailable on the
// date, so a readonly token can view the full order of service without ever
// calling /people.

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { requireScope, assertMinistryWrite } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { ministryIdBySlug, requireLouvorOrAdmin } from "../_shared/ministries.ts";
import { buildDetail } from "../_shared/service-detail.ts";
import { shareSignature } from "../_shared/crypto.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";

interface ServiceHeaderInput {
  service_date?: string;
  service_time?: string;
  label?: string | null;
  theme?: string | null;
  scripture?: string | null;
  preacher_id?: string | null;
  leader_id?: string | null;
  notes?: string | null;
  ebd_theme?: string | null;
  ebd_notes?: string | null;
}

interface AssignmentInput {
  person_id: string | null;
  role: string;
  sort_order?: number;
}

interface SongInput {
  position?: number;
  title: string;
  author?: string | null;
  song_key?: string | null;
  moment?: string;
  link?: string | null;
}

// buildDetail moved to _shared/service-detail.ts (also used by /share).

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.tokenId);
    const db = serviceClient();
    const seg = pathSegments(req, "services");
    const url = new URL(req.url);

    // ---- collection ---------------------------------------------------------
    if (seg.length === 0) {
      if (req.method === "GET") {
        const date = url.searchParams.get("date");
        if (date) {
          const { data } = await db
            .from("services")
            .select("id")
            .eq("service_date", date)
            .order("service_time")
            .limit(1);
          if (!data || data.length === 0) throw new HttpError(404, "no service on that date");
          return jsonResponse(req, 200, await buildDetail(db, data[0].id));
        }
        const year = url.searchParams.get("year");
        let q = db.from("services").select("*");
        if (year) q = q.gte("service_date", `${year}-01-01`).lte("service_date", `${year}-12-31`);
        const { data, error } = await q.order("service_date").order("service_time");
        if (error) throw new HttpError(500, error.message);
        return jsonResponse(req, 200, data);
      }
      if (req.method === "POST") {
        requireScope(identity, "admin");
        const body = await readJson<ServiceHeaderInput>(req);
        if (!body.service_date) throw new HttpError(400, "service_date is required");
        const { data, error } = await db
          .from("services")
          .insert({ service_date: body.service_date, service_time: body.service_time ?? "10:30", label: body.label ?? null })
          .select()
          .single();
        if (error) throw new HttpError(400, error.message);
        await writeAudit(db, identity, { action: "create", entity: "services", entityId: data.id, after: data });
        return jsonResponse(req, 201, data);
      }
      throw new HttpError(405, "method not allowed");
    }

    // ---- /generate ----------------------------------------------------------
    if (seg.length === 1 && seg[0] === "generate" && req.method === "POST") {
      requireScope(identity, "admin");
      const body = await readJson<{ year?: number }>(req);
      const year = Number(body.year);
      if (!Number.isInteger(year)) throw new HttpError(400, "year must be an integer");
      const { data, error } = await db.rpc("generate_sundays", { p_year: year });
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, { action: "create", entity: "services", entityId: null, after: { year, inserted: data } });
      return jsonResponse(req, 200, { year, inserted: data });
    }

    const id = seg[0];

    // ---- single item --------------------------------------------------------
    if (seg.length === 1) {
      if (req.method === "GET") return jsonResponse(req, 200, await buildDetail(db, id));
      if (req.method === "PATCH") {
        const body = await readJson<ServiceHeaderInput>(req);
        // The EBD ministry may edit its own lesson fields; everything else in
        // the header (theme, preacher, dates…) stays admin-only.
        const keys = Object.keys(body);
        const ebdOnly = keys.length > 0 && keys.every((k) => k === "ebd_theme" || k === "ebd_notes");
        if (ebdOnly && identity.scope !== "admin") {
          const ebdId = await ministryIdBySlug(db, "ebd");
          assertMinistryWrite(identity, ebdId);
        } else {
          requireScope(identity, "admin");
        }
        const { data: before } = await db.from("services").select("*").eq("id", id).maybeSingle();
        if (!before) throw new HttpError(404, "service not found");
        // The preacher must belong to Presbitério or Convidados.
        if (body.preacher_id) {
          const { data: allowed } = await db
            .from("ministry_members")
            .select("id, ministries!inner(slug)")
            .eq("person_id", body.preacher_id)
            .in("ministries.slug", ["presbiterio", "convidados"])
            .limit(1);
          if (!allowed || allowed.length === 0) {
            throw new HttpError(400, "o pregador deve pertencer ao Presbitério ou aos Convidados");
          }
        }
        const { data, error } = await db
          .from("services")
          .update({
            ...(body.service_date !== undefined && { service_date: body.service_date }),
            ...(body.service_time !== undefined && { service_time: body.service_time }),
            ...(body.label !== undefined && { label: body.label }),
            ...(body.theme !== undefined && { theme: body.theme }),
            ...(body.scripture !== undefined && { scripture: body.scripture }),
            ...(body.preacher_id !== undefined && { preacher_id: body.preacher_id }),
            ...(body.leader_id !== undefined && { leader_id: body.leader_id }),
            ...(body.notes !== undefined && { notes: body.notes }),
            ...(body.ebd_theme !== undefined && { ebd_theme: body.ebd_theme }),
            ...(body.ebd_notes !== undefined && { ebd_notes: body.ebd_notes }),
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw new HttpError(400, error.message);
        await writeAudit(db, identity, { action: "update", entity: "services", entityId: id, before, after: data });
        return jsonResponse(req, 200, data);
      }
      throw new HttpError(405, "method not allowed");
    }

    // ---- share link: signed public URL for one service ----------------------
    if (seg.length === 2 && seg[1] === "share-link" && req.method === "GET") {
      const { data: service } = await db.from("services").select("id").eq("id", id).maybeSingle();
      if (!service) throw new HttpError(404, "service not found");
      const ministry = url.searchParams.get("ministry") ?? "all";
      if (ministry !== "all") await ministryIdBySlug(db, ministry); // validate slug
      const sig = await shareSignature(id, ministry);
      // Prefer the host the caller actually used (locally SUPABASE_URL is the
      // internal Docker address, kong:8000); fall back to SUPABASE_URL.
      const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
      const fwdPort = req.headers.get("x-forwarded-port");
      let fwdHost = req.headers.get("x-forwarded-host");
      if (fwdHost && fwdPort && !fwdHost.includes(":") && fwdPort !== "80" && fwdPort !== "443") {
        fwdHost = `${fwdHost}:${fwdPort}`;
      }
      const base = fwdHost ? `${fwdProto}://${fwdHost}` : Deno.env.get("SUPABASE_URL") ?? "";
      return jsonResponse(req, 200, {
        url: `${base}/functions/v1/share/${id}?ministry=${encodeURIComponent(ministry)}&sig=${sig}`,
      });
    }

    // ---- sub-resources: assignments / songs / ebd ---------------------------
    if (seg.length === 2 && req.method === "PUT") {
      const sub = seg[1];
      const { data: service } = await db.from("services").select("id").eq("id", id).maybeSingle();
      if (!service) throw new HttpError(404, "service not found");

      if (sub === "assignments") {
        const slug = url.searchParams.get("ministry");
        if (!slug) throw new HttpError(400, "ministry query param is required");
        const ministryId = await ministryIdBySlug(db, slug);
        assertMinistryWrite(identity, ministryId);
        const body = await readJson<{ assignments: AssignmentInput[] }>(req);
        await db.from("service_assignments").delete().eq("service_id", id).eq("ministry_id", ministryId);
        if (body.assignments.length > 0) {
          const rows = body.assignments.map((a, i) => ({
            service_id: id,
            ministry_id: ministryId,
            person_id: a.person_id,
            role: a.role,
            sort_order: a.sort_order ?? i,
          }));
          const { error } = await db.from("service_assignments").insert(rows);
          if (error) throw new HttpError(400, error.message);
        }
        await writeAudit(db, identity, { action: "update", entity: "service_assignments", entityId: id, after: body.assignments, ministryId });
        return jsonResponse(req, 200, await buildDetail(db, id));
      }

      if (sub === "songs") {
        await requireLouvorOrAdmin(db, identity);
        const body = await readJson<{ songs: SongInput[] }>(req);
        await db.from("service_songs").delete().eq("service_id", id);
        if (body.songs.length > 0) {
          const rows = body.songs.map((s, i) => ({
            service_id: id,
            position: s.position ?? i,
            title: s.title,
            author: s.author ?? null,
            song_key: s.song_key ?? null,
            moment: s.moment ?? "outro",
            link: s.link ?? null,
          }));
          const { error } = await db.from("service_songs").insert(rows);
          if (error) throw new HttpError(400, error.message);
        }
        await writeAudit(db, identity, { action: "update", entity: "service_songs", entityId: id, after: body.songs });
        return jsonResponse(req, 200, await buildDetail(db, id));
      }

      if (sub === "ebd") {
        // Editable by admin or the EBD ministry.
        const ebdId = await ministryIdBySlug(db, "ebd");
        assertMinistryWrite(identity, ebdId);
        const classId = url.searchParams.get("class");
        if (!classId) throw new HttpError(400, "class query param is required");
        const body = await readJson<{ assignments: AssignmentInput[] }>(req);
        await db.from("ebd_assignments").delete().eq("service_id", id).eq("ebd_class_id", classId);
        if (body.assignments.length > 0) {
          const rows = body.assignments.map((a, i) => ({
            service_id: id,
            ebd_class_id: classId,
            person_id: a.person_id,
            role: a.role || "Professor",
            sort_order: a.sort_order ?? i,
          }));
          const { error } = await db.from("ebd_assignments").insert(rows);
          if (error) throw new HttpError(400, error.message);
        }
        await writeAudit(db, identity, { action: "update", entity: "ebd_assignments", entityId: id, after: body.assignments, ministryId: ebdId });
        return jsonResponse(req, 200, await buildDetail(db, id));
      }

      throw new HttpError(404, "unknown sub-resource");
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
