// /people (PROMPT.md sections 5 & 6).
//   GET            -> list (admin: full; ministry: names only; readonly: 403)
//   POST           -> create (admin or ministry)
//   PATCH  /{id}   -> update (admin any; ministry only own members)
//   DELETE /{id}   -> delete (admin any; ministry only own members)
//
// `people` are global. A `ministry` token may only edit/remove a person that is
// a member of its own ministry (via ministry_members).

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { requireScope } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Identity } from "../_shared/identity.ts";

interface PersonInput {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  active?: boolean;
  notes?: string | null;
}

async function personInMinistry(
  db: SupabaseClient,
  personId: string,
  ministryId: string,
): Promise<boolean> {
  const { data } = await db
    .from("ministry_members")
    .select("id")
    .eq("person_id", personId)
    .eq("ministry_id", ministryId)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

// A ministry token editing a person must own it; admin owns everything.
async function assertPersonWritable(
  db: SupabaseClient,
  identity: Identity,
  personId: string,
): Promise<void> {
  if (identity.scope === "admin") return;
  if (
    identity.scope === "ministry" &&
    identity.ministryId &&
    (await personInMinistry(db, personId, identity.ministryId))
  ) {
    return;
  }
  throw new HttpError(403, "cannot modify a person outside your ministry");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.tokenId);
    const db = serviceClient();
    const id = pathSegments(req, "people")[0];

    if (req.method === "GET" && !id) {
      // readonly tokens do not get the people directory (PII).
      requireScope(identity, "admin", "ministry");
      const columns =
        identity.scope === "admin"
          ? "id, full_name, email, phone, active, notes, created_at"
          : "id, full_name, active"; // ministry: no contact details
      const { data, error } = await db.from("people").select(columns).order("full_name");
      if (error) throw new HttpError(500, error.message);
      return jsonResponse(req, 200, data);
    }

    if (req.method === "POST" && !id) {
      requireScope(identity, "admin", "ministry");
      const body = await readJson<PersonInput>(req);
      if (!body.full_name) throw new HttpError(400, "full_name is required");
      const { data, error } = await db
        .from("people")
        .insert({
          full_name: body.full_name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          active: body.active ?? true,
          notes: body.notes ?? null,
        })
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "create",
        entity: "people",
        entityId: data.id,
        after: data,
      });
      return jsonResponse(req, 201, data);
    }

    if (req.method === "PATCH" && id) {
      requireScope(identity, "admin", "ministry");
      const { data: before } = await db.from("people").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "person not found");
      await assertPersonWritable(db, identity, id);
      const body = await readJson<PersonInput>(req);
      const { data, error } = await db
        .from("people")
        .update({
          ...(body.full_name !== undefined && { full_name: body.full_name }),
          ...(body.email !== undefined && { email: body.email }),
          ...(body.phone !== undefined && { phone: body.phone }),
          ...(body.active !== undefined && { active: body.active }),
          ...(body.notes !== undefined && { notes: body.notes }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "update",
        entity: "people",
        entityId: id,
        before,
        after: data,
      });
      return jsonResponse(req, 200, data);
    }

    if (req.method === "DELETE" && id) {
      requireScope(identity, "admin", "ministry");
      const { data: before } = await db.from("people").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "person not found");
      await assertPersonWritable(db, identity, id);
      const { error } = await db.from("people").delete().eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "delete",
        entity: "people",
        entityId: id,
        before,
      });
      return jsonResponse(req, 204, null);
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
