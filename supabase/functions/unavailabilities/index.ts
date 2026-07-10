// /unavailabilities (PROMPT.md sections 3 & 11, Phase 4).
//   GET ?from=&to=   -> list (admin: all; ministry: all — needed for planning; readonly: 403)
//   POST             -> declare (admin any person; ministry only its own members)
//   DELETE /{id}     -> remove (same rule as POST)

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity, type Identity } from "../_shared/identity.ts";
import { requireScope } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface UnavailabilityInput {
  person_id?: string;
  start_date?: string;
  end_date?: string;
  reason?: string | null;
}

async function assertPersonWritable(db: SupabaseClient, identity: Identity, personId: string) {
  if (identity.scope === "admin") return;
  if (identity.scope === "ministry" && identity.ministryId) {
    const { data } = await db
      .from("ministry_members")
      .select("id")
      .eq("person_id", personId)
      .eq("ministry_id", identity.ministryId)
      .limit(1);
    if (Array.isArray(data) && data.length > 0) return;
  }
  throw new HttpError(403, "cannot manage unavailability for a person outside your ministry");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.tokenId);
    requireScope(identity, "admin", "ministry");
    const db = serviceClient();
    const id = pathSegments(req, "unavailabilities")[0];
    const url = new URL(req.url);

    if (req.method === "GET" && !id) {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let q = db.from("unavailabilities").select("*, people(full_name)").order("start_date");
      if (from) q = q.gte("end_date", from);
      if (to) q = q.lte("start_date", to);
      const { data, error } = await q;
      if (error) throw new HttpError(500, error.message);
      return jsonResponse(
        req,
        200,
        (data ?? []).map((u) => {
          const { people, ...rest } = u as Record<string, unknown> & {
            people: { full_name: string } | null;
          };
          return { ...rest, person_name: people?.full_name ?? null };
        }),
      );
    }

    if (req.method === "POST" && !id) {
      const body = await readJson<UnavailabilityInput>(req);
      if (!body.person_id || !body.start_date || !body.end_date) {
        throw new HttpError(400, "person_id, start_date and end_date are required");
      }
      await assertPersonWritable(db, identity, body.person_id);
      const { data, error } = await db
        .from("unavailabilities")
        .insert({
          person_id: body.person_id,
          start_date: body.start_date,
          end_date: body.end_date,
          reason: body.reason ?? null,
        })
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, { action: "create", entity: "unavailabilities", entityId: data.id, after: data });
      return jsonResponse(req, 201, data);
    }

    if (req.method === "DELETE" && id) {
      const { data: before } = await db.from("unavailabilities").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "unavailability not found");
      await assertPersonWritable(db, identity, before.person_id);
      const { error } = await db.from("unavailabilities").delete().eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, { action: "delete", entity: "unavailabilities", entityId: id, before });
      return jsonResponse(req, 204, null);
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
