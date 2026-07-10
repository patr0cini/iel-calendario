// /events (PROMPT.md section 6).
//   GET ?from=&to=  -> all events overlapping the range (any scope)
//   POST            -> create (admin any; ministry only its own)
//   PATCH  /{id}    -> update (admin any; ministry only its own)
//   DELETE /{id}    -> delete (admin any; ministry only its own)
//
// Deleting an event with an outlook_event_id queues its removal via the DB
// trigger (outbox), so Outlook does not keep a ghost copy (PROMPT §7).

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { assertMinistryWrite } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";

type EventStatus = "proposta" | "confirmada" | "cancelada";

interface EventInput {
  ministry_id?: string;
  title?: string;
  description?: string | null;
  starts_at?: string;
  ends_at?: string;
  all_day?: boolean;
  location?: string | null;
  status?: EventStatus;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.tokenId);
    const db = serviceClient();
    const id = pathSegments(req, "events")[0];
    const url = new URL(req.url);

    if (req.method === "GET" && !id) {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const syncState = url.searchParams.get("sync_state"); // admin panel: failed syncs
      let query = db.from("events").select("*");
      // Overlap: event ends after `from` and starts before `to`.
      if (from) query = query.gte("ends_at", from);
      if (to) query = query.lte("starts_at", to);
      if (syncState) query = query.eq("sync_state", syncState);
      const { data, error } = await query.order("starts_at");
      if (error) throw new HttpError(500, error.message);
      return jsonResponse(req, 200, data);
    }

    if (req.method === "POST" && !id) {
      const body = await readJson<EventInput>(req);
      if (!body.ministry_id || !body.title || !body.starts_at || !body.ends_at) {
        throw new HttpError(400, "ministry_id, title, starts_at and ends_at are required");
      }
      assertMinistryWrite(identity, body.ministry_id);
      const { data, error } = await db
        .from("events")
        .insert({
          ministry_id: body.ministry_id,
          title: body.title,
          description: body.description ?? null,
          starts_at: body.starts_at,
          ends_at: body.ends_at,
          all_day: body.all_day ?? false,
          location: body.location ?? null,
          status: body.status ?? "proposta",
          created_by_token: identity.tokenId,
        })
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "create",
        entity: "events",
        entityId: data.id,
        after: data,
        ministryId: data.ministry_id,
      });
      return jsonResponse(req, 201, data);
    }

    if (req.method === "PATCH" && id) {
      const { data: before } = await db.from("events").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "event not found");
      assertMinistryWrite(identity, before.ministry_id);
      const body = await readJson<EventInput>(req);
      // Reassigning to another ministry requires write access to it too.
      if (body.ministry_id !== undefined) assertMinistryWrite(identity, body.ministry_id);
      const { data, error } = await db
        .from("events")
        .update({
          ...(body.ministry_id !== undefined && { ministry_id: body.ministry_id }),
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.starts_at !== undefined && { starts_at: body.starts_at }),
          ...(body.ends_at !== undefined && { ends_at: body.ends_at }),
          ...(body.all_day !== undefined && { all_day: body.all_day }),
          ...(body.location !== undefined && { location: body.location }),
          ...(body.status !== undefined && { status: body.status }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "update",
        entity: "events",
        entityId: id,
        before,
        after: data,
        ministryId: data.ministry_id,
      });
      return jsonResponse(req, 200, data);
    }

    if (req.method === "DELETE" && id) {
      const { data: before } = await db.from("events").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "event not found");
      assertMinistryWrite(identity, before.ministry_id);
      const { error } = await db.from("events").delete().eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "delete",
        entity: "events",
        entityId: id,
        before,
        ministryId: before.ministry_id,
      });
      return jsonResponse(req, 204, null);
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
