// /ministry-members (PROMPT.md sections 5 & 6).
//   POST           -> add member    (admin any; ministry only its own ministry)
//   PATCH  /{id}   -> update member (admin any; ministry only its own ministry)
//   DELETE /{id}   -> remove member (admin any; ministry only its own ministry)
//
// This is where the cross-ministry rule bites: a `ministry` token adding a
// member to another ministry gets 403 (assertMinistryWrite).

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { requireScope, assertMinistryWrite } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";

interface MemberInput {
  ministry_id?: string;
  person_id?: string;
  role?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.rateKey);
    const db = serviceClient();
    const id = pathSegments(req, "ministry-members")[0];
    const url = new URL(req.url);

    if (req.method === "GET" && !id) {
      requireScope(identity, "admin", "ministry");
      let q = db.from("ministry_members").select("*");
      const person = url.searchParams.get("person");
      if (person) q = q.eq("person_id", person);
      // A ministry token only sees its own ministry's memberships.
      if (identity.scope === "ministry" && identity.ministryIds.length > 0) {
        q = q.in("ministry_id", identity.ministryIds);
      } else {
        const ministry = url.searchParams.get("ministry");
        if (ministry) q = q.eq("ministry_id", ministry);
      }
      const { data, error } = await q;
      if (error) throw new HttpError(500, error.message);
      return jsonResponse(req, 200, data);
    }

    if (req.method === "POST" && !id) {
      requireScope(identity, "admin", "ministry");
      const body = await readJson<MemberInput>(req);
      if (!body.ministry_id || !body.person_id) {
        throw new HttpError(400, "ministry_id and person_id are required");
      }
      assertMinistryWrite(identity, body.ministry_id);
      const { data, error } = await db
        .from("ministry_members")
        .insert({
          ministry_id: body.ministry_id,
          person_id: body.person_id,
          role: body.role ?? null,
        })
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "create",
        entity: "ministry_members",
        entityId: data.id,
        after: data,
        ministryId: body.ministry_id,
      });
      return jsonResponse(req, 201, data);
    }

    if (req.method === "PATCH" && id) {
      requireScope(identity, "admin", "ministry");
      const { data: before } = await db
        .from("ministry_members")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!before) throw new HttpError(404, "membership not found");
      assertMinistryWrite(identity, before.ministry_id);
      const body = await readJson<MemberInput>(req);
      // Moving a member to another ministry requires write access to it too.
      if (body.ministry_id !== undefined) assertMinistryWrite(identity, body.ministry_id);
      const { data, error } = await db
        .from("ministry_members")
        .update({
          ...(body.ministry_id !== undefined && { ministry_id: body.ministry_id }),
          ...(body.person_id !== undefined && { person_id: body.person_id }),
          ...(body.role !== undefined && { role: body.role }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "update",
        entity: "ministry_members",
        entityId: id,
        before,
        after: data,
        ministryId: before.ministry_id,
      });
      return jsonResponse(req, 200, data);
    }

    if (req.method === "DELETE" && id) {
      requireScope(identity, "admin", "ministry");
      const { data: before } = await db
        .from("ministry_members")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!before) throw new HttpError(404, "membership not found");
      assertMinistryWrite(identity, before.ministry_id);
      const { error } = await db.from("ministry_members").delete().eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "delete",
        entity: "ministry_members",
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
