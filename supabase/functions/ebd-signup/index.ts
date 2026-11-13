// /ebd-signup — self sign-up for Sunday School lessons (used by ebd.iel.pt).
//   GET    ?from=YYYY-MM-DD&to=YYYY-MM-DD -> classes, EBD members and who is on each Sunday
//   POST   { date, class_id, person_id }  -> join a class (several teachers per class)
//   DELETE ?date=&class=&person=          -> leave a class
//
// Writes land in ebd_assignments, the same table the order of service reads,
// so a sign-up here shows up in app.iel.pt straight away.
//
// Who may do what:
//   - No credentials (ebd.iel.pt is open, decided by the Presbitério on
//     2026-11-13 until Microsoft sign-in comes): acts as the EBD ministry, but
//     ONLY inside this function — pick a name from the EBD members; removing
//     someone means naming them. Nothing else in the API
//     opens up: every other function still requires a token.
//   - Microsoft sign-in: you sign yourself up / remove yourself.
//   - EBD link: same as no credentials.
//   - Admin and EBD leaders may add or remove anyone.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import { serviceClient } from "../_shared/supabase.ts";
import { resolveIdentity, type Identity } from "../_shared/identity.ts";
import { assertMinistryWrite } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { ministryIdBySlug } from "../_shared/ministries.ts";
import { isFirstSundayOfMonth } from "../_shared/service-detail.ts";
import { HttpError, errorResponse, jsonResponse, preflight, readJson } from "../_shared/http.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Member {
  id: string;
  full_name: string;
  is_leader: boolean;
}

async function ebdMembers(db: SupabaseClient, ebdId: string): Promise<Member[]> {
  const { data, error } = await db
    .from("ministry_members")
    .select("is_leader, people!inner(id, full_name, active)")
    .eq("ministry_id", ebdId);
  if (error) throw new HttpError(500, error.message);
  const rows = (data ?? []) as unknown as {
    is_leader: boolean;
    people: { id: string; full_name: string; active: boolean };
  }[];
  return rows
    .filter((r) => r.people.active !== false)
    .map((r) => ({ id: r.people.id, full_name: r.people.full_name, is_leader: r.is_leader }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt"));
}

/** The anonymous visitor of ebd.iel.pt — EBD ministry powers, this function only. */
function publicIdentity(req: Request, ebdId: string): Identity {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return {
    tokenId: null,
    rateKey: `ebd-public:${ip}`,
    ministryId: ebdId,
    ministryIds: [ebdId],
    scope: "ministry",
    personId: null,
    displayName: "ebd.iel.pt (público)",
  };
}

function canManage(identity: Identity, members: Member[]): boolean {
  if (identity.scope === "admin") return true;
  return identity.personId !== null && members.some((m) => m.id === identity.personId && m.is_leader);
}

async function serviceOn(db: SupabaseClient, date: string): Promise<string> {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const db = serviceClient();
    const ebdId = await ministryIdBySlug(db, "ebd");
    const identity = (await resolveIdentity(req)) ?? publicIdentity(req, ebdId);
    enforceRateLimit(identity.rateKey);
    assertMinistryWrite(identity, ebdId);
    const members = await ebdMembers(db, ebdId);
    const manager = canManage(identity, members);
    const url = new URL(req.url);

    if (req.method === "GET") {
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new HttpError(400, "from and to are required (YYYY-MM-DD)");

      const [classes, services] = await Promise.all([
        db.from("ebd_classes").select("id, name").eq("active", true).order("sort_order"),
        db.from("services").select("id, service_date").gte("service_date", from).lte("service_date", to),
      ]);
      if (classes.error || services.error) throw new HttpError(500, "lookup failed");

      const dateById = new Map((services.data ?? []).map((s) => [s.id as string, s.service_date as string]));
      const { data: assignments, error } = dateById.size
        ? await db
            .from("ebd_assignments")
            .select("service_id, ebd_class_id, person_id, people(full_name)")
            .in("service_id", [...dateById.keys()])
            .not("person_id", "is", null)
            .order("sort_order")
        : { data: [], error: null };
      if (error) throw new HttpError(500, error.message);

      // { "2026-11-15": { "<classId>": [{ person_id, name }, …] } } in sign-up order.
      const lessons: Record<string, Record<string, { person_id: string; name: string }[]>> = {};
      for (const a of (assignments ?? []) as unknown as {
        service_id: string;
        ebd_class_id: string;
        person_id: string;
        people: { full_name: string } | null;
      }[]) {
        const date = dateById.get(a.service_id);
        if (!date) continue;
        const people = ((lessons[date] ??= {})[a.ebd_class_id] ??= []);
        if (!people.some((p) => p.person_id === a.person_id)) {
          people.push({ person_id: a.person_id, name: a.people?.full_name ?? "—" });
        }
      }

      return jsonResponse(req, 200, {
        classes: classes.data ?? [],
        members: members.map((m) => ({ id: m.id, full_name: m.full_name })),
        me: identity.personId,
        can_manage: manager,
        lessons,
      });
    }

    if (req.method === "POST") {
      const body = await readJson<{ date?: string; class_id?: string; person_id?: string }>(req);
      if (!body.date || !body.class_id || !body.person_id) {
        throw new HttpError(400, "date, class_id and person_id are required");
      }
      if (!members.some((m) => m.id === body.person_id)) {
        throw new HttpError(403, "Só os membros da EBD se podem escalar.");
      }
      if (identity.personId && !manager && body.person_id !== identity.personId) {
        throw new HttpError(403, "Só te podes escalar a ti.");
      }
      const serviceId = await serviceOn(db, body.date);
      await activeClass(db, body.class_id);

      const { data, error } = await db.rpc("ebd_join_class", {
        p_service: serviceId,
        p_class: body.class_id,
        p_person: body.person_id,
      });
      if (error) throw new HttpError(400, error.message);
      if (data === "already") return jsonResponse(req, 200, { ok: true });

      await writeAudit(db, identity, {
        action: "update",
        entity: "ebd_assignments",
        entityId: serviceId,
        after: { class_id: body.class_id, person_id: body.person_id, via: "ebd-signup" },
        ministryId: ebdId,
      });
      return jsonResponse(req, 200, { ok: true });
    }

    if (req.method === "DELETE") {
      const date = url.searchParams.get("date") ?? "";
      const classId = url.searchParams.get("class") ?? "";
      const personId = url.searchParams.get("person") ?? "";
      if (!classId || !personId) throw new HttpError(400, "date, class and person are required");
      if (identity.personId && !manager && personId !== identity.personId) {
        throw new HttpError(403, "Só te podes retirar a ti.");
      }
      const serviceId = await serviceOn(db, date);

      // Removal names the person, so a stale page never removes someone else.
      const { data: removed, error } = await db
        .from("ebd_assignments")
        .delete()
        .eq("service_id", serviceId)
        .eq("ebd_class_id", classId)
        .eq("person_id", personId)
        .select("id");
      if (error) throw new HttpError(400, error.message);
      if (!removed || removed.length === 0) throw new HttpError(409, "A escala mudou entretanto. Atualiza a página.");

      await writeAudit(db, identity, {
        action: "delete",
        entity: "ebd_assignments",
        entityId: serviceId,
        before: { class_id: classId, person_id: personId, via: "ebd-signup" },
        ministryId: ebdId,
      });
      return jsonResponse(req, 200, { ok: true });
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
