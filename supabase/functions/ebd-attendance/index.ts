// /ebd-attendance — Sunday School attendance (used by ebd.iel.pt).
//   GET   ?date=YYYY-MM-DD               -> classes, children, who was present
//   GET   ?from=…&to=…                   -> number present per lesson and class
//   PUT   { date, class_id, present[] }  -> replace that class's attendance
//   POST  /children { full_name, class_id }          -> add a child
//   PATCH /children/{id} { full_name?, class_id?, active? } -> edit / move / hide
//
// Children are minors: only a PERSONAL sign-in (Microsoft or Google) of an EBD
// member, or the Presbitério (admin), gets in. Link tokens and the open
// sign-up never do.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity, type Identity } from "../_shared/identity.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { ministryIdBySlug } from "../_shared/ministries.ts";
import { isFirstSundayOfMonth } from "../_shared/service-detail.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireTeacher(identity: Identity, ebdId: string): void {
  if (!identity.personId) {
    throw new HttpError(403, "As presenças pedem login com Microsoft ou Google.");
  }
  if (identity.scope === "admin" || identity.ministryIds.includes(ebdId)) return;
  throw new HttpError(403, "Só a equipa da EBD pode ver e registar presenças.");
}

/** Today in Lisbon, as YYYY-MM-DD. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

async function lessonService(db: SupabaseClient, date: string): Promise<string> {
  if (!DATE_RE.test(date)) throw new HttpError(400, "date must be YYYY-MM-DD");
  if (isFirstSundayOfMonth(date)) throw new HttpError(400, "Não há EBD no domingo de Ceia.");
  const { data } = await db.from("services").select("id").eq("service_date", date).maybeSingle();
  if (!data) throw new HttpError(404, "Não existe culto nessa data.");
  return data.id as string;
}

async function activeClass(db: SupabaseClient, classId: string): Promise<void> {
  const { data } = await db.from("ebd_classes").select("id").eq("id", classId).eq("active", true).maybeSingle();
  if (!data) throw new HttpError(404, "Classe desconhecida.");
}

function cleanName(v: unknown): string {
  const name = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new HttpError(400, "Falta o nome.");
  if (name.length > 80) throw new HttpError(400, "Nome demasiado comprido.");
  return name;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.rateKey);
    const db = serviceClient();
    const ebdId = await ministryIdBySlug(db, "ebd");
    requireTeacher(identity, ebdId);
    const seg = pathSegments(req, "ebd-attendance");
    const url = new URL(req.url);

    // ---- children ------------------------------------------------------------
    if (seg[0] === "children") {
      if (req.method === "POST" && !seg[1]) {
        const body = await readJson<{ full_name?: string; class_id?: string }>(req);
        const full_name = cleanName(body.full_name);
        if (!body.class_id) throw new HttpError(400, "class_id is required");
        await activeClass(db, body.class_id);
        const { data, error } = await db
          .from("ebd_children")
          .insert({ full_name, ebd_class_id: body.class_id })
          .select("id, full_name, ebd_class_id, active")
          .single();
        if (error) throw new HttpError(400, error.message);
        await writeAudit(db, identity, { action: "create", entity: "ebd_children", entityId: data.id, after: data, ministryId: ebdId });
        return jsonResponse(req, 201, data);
      }
      if (req.method === "PATCH" && seg[1]) {
        const body = await readJson<{ full_name?: string; class_id?: string; active?: boolean }>(req);
        const patch: Record<string, unknown> = {};
        if (body.full_name !== undefined) patch.full_name = cleanName(body.full_name);
        if (body.class_id !== undefined) {
          await activeClass(db, body.class_id);
          patch.ebd_class_id = body.class_id;
        }
        if (body.active !== undefined) patch.active = Boolean(body.active);
        const { data: before } = await db.from("ebd_children").select("*").eq("id", seg[1]).maybeSingle();
        if (!before) throw new HttpError(404, "Criança não encontrada.");
        const { data, error } = await db
          .from("ebd_children")
          .update(patch)
          .eq("id", seg[1])
          .select("id, full_name, ebd_class_id, active")
          .single();
        if (error) throw new HttpError(400, error.message);
        await writeAudit(db, identity, { action: "update", entity: "ebd_children", entityId: seg[1], before, after: data, ministryId: ebdId });
        return jsonResponse(req, 200, data);
      }
      throw new HttpError(405, "method not allowed");
    }

    // ---- attendance ----------------------------------------------------------
    if (req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (from && to) {
        if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new HttpError(400, "from/to must be YYYY-MM-DD");
        const { data: services } = await db.from("services").select("id, service_date").gte("service_date", from).lte("service_date", to);
        const dateById = new Map((services ?? []).map((s) => [s.id as string, s.service_date as string]));
        const counts: Record<string, Record<string, number>> = {};
        if (dateById.size) {
          const { data, error } = await db.from("ebd_attendance").select("service_id, ebd_class_id").in("service_id", [...dateById.keys()]);
          if (error) throw new HttpError(500, error.message);
          for (const a of data ?? []) {
            const day = (counts[dateById.get(a.service_id as string)!] ??= {});
            day[a.ebd_class_id as string] = (day[a.ebd_class_id as string] ?? 0) + 1;
          }
        }
        return jsonResponse(req, 200, { counts });
      }

      const date = url.searchParams.get("date") ?? "";
      const serviceId = await lessonService(db, date);
      const [classes, children, present] = await Promise.all([
        db.from("ebd_classes").select("id, name").eq("active", true).order("sort_order"),
        db.from("ebd_children").select("id, full_name, ebd_class_id, active").order("full_name"),
        db.from("ebd_attendance").select("child_id, ebd_class_id, created_at, people(full_name)").eq("service_id", serviceId),
      ]);
      if (classes.error || children.error || present.error) throw new HttpError(500, "lookup failed");
      const presentIds = new Set((present.data ?? []).map((p) => p.child_id as string));
      return jsonResponse(req, 200, {
        date,
        classes: classes.data,
        // Hidden children stay listed only where they were marked present.
        children: (children.data ?? []).filter((c) => c.active || presentIds.has(c.id as string)),
        present: [...presentIds],
        recorded_by: Object.fromEntries(
          (present.data ?? []).map((p) => [
            p.ebd_class_id as string,
            (p as unknown as { people: { full_name: string } | null }).people?.full_name ?? null,
          ]),
        ),
      });
    }

    if (req.method === "PUT") {
      const body = await readJson<{ date?: string; class_id?: string; present?: string[] }>(req);
      if (!body.date || !body.class_id || !Array.isArray(body.present)) {
        throw new HttpError(400, "date, class_id and present[] are required");
      }
      if (body.date > today()) throw new HttpError(400, "Só se registam presenças de lições que já aconteceram.");
      const serviceId = await lessonService(db, body.date);
      await activeClass(db, body.class_id);

      const ids = [...new Set(body.present)];
      if (ids.length) {
        const { data: kids } = await db.from("ebd_children").select("id").in("id", ids);
        if ((kids ?? []).length !== ids.length) throw new HttpError(400, "Há crianças desconhecidas na lista.");
      }

      await db.from("ebd_attendance").delete().eq("service_id", serviceId).eq("ebd_class_id", body.class_id);
      if (ids.length) {
        // A child present in another class that Sunday moves to this one.
        await db.from("ebd_attendance").delete().eq("service_id", serviceId).in("child_id", ids);
        const { error } = await db.from("ebd_attendance").insert(
          ids.map((child_id) => ({ service_id: serviceId, ebd_class_id: body.class_id, child_id, recorded_by: identity.personId })),
        );
        if (error) throw new HttpError(400, error.message);
      }
      await writeAudit(db, identity, {
        action: "update",
        entity: "ebd_attendance",
        entityId: serviceId,
        after: { class_id: body.class_id, present: ids.length },
        ministryId: ebdId,
      });
      return jsonResponse(req, 200, { ok: true, present: ids.length });
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
