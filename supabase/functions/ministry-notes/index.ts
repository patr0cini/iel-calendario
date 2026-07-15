// /ministry-notes — free-text notes shown in a ministry's section of the order
// of service.
//   POST          -> create (admin, or the ministry itself)
//   DELETE /{id}  -> delete (same rule)
//
// A note pinned to one service carries `service_id`; a recurring one
// ("repetir sempre") leaves it null and shows on every service until deleted.

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { requireScope, assertMinistryWrite } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";

interface NoteInput {
  ministry_id?: string;
  /** null/absent = recurring note ("repetir sempre"). */
  service_id?: string | null;
  body?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.tokenId);
    requireScope(identity, "admin", "ministry");
    const db = serviceClient();
    const id = pathSegments(req, "ministry-notes")[0];

    if (req.method === "POST" && !id) {
      const input = await readJson<NoteInput>(req);
      if (!input.ministry_id || !input.body?.trim()) {
        throw new HttpError(400, "ministry_id and body are required");
      }
      assertMinistryWrite(identity, input.ministry_id);
      const { data, error } = await db
        .from("ministry_notes")
        .insert({
          ministry_id: input.ministry_id,
          service_id: input.service_id ?? null,
          body: input.body.trim(),
        })
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "create",
        entity: "ministry_notes",
        entityId: data.id,
        after: data,
        ministryId: input.ministry_id,
      });
      return jsonResponse(req, 201, data);
    }

    if (req.method === "DELETE" && id) {
      const { data: before } = await db.from("ministry_notes").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "note not found");
      assertMinistryWrite(identity, before.ministry_id);
      const { error } = await db.from("ministry_notes").delete().eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "delete",
        entity: "ministry_notes",
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
