// /ebd-classes — Sunday School classes (editable catalog, PROMPT §13 decision).
//   GET            -> list (any scope)
//   POST           -> create (admin)
//   PATCH  /{id}   -> update (admin)
//   DELETE /{id}   -> delete (admin; cascades to ebd_assignments)

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { requireScope } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";

interface ClassInput {
  name?: string;
  age_range?: string | null;
  sort_order?: number;
  active?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.rateKey);
    const db = serviceClient();
    const id = pathSegments(req, "ebd-classes")[0];

    if (req.method === "GET" && !id) {
      const { data, error } = await db.from("ebd_classes").select("*").order("sort_order");
      if (error) throw new HttpError(500, error.message);
      return jsonResponse(req, 200, data);
    }

    requireScope(identity, "admin");

    if (req.method === "POST" && !id) {
      const body = await readJson<ClassInput>(req);
      if (!body.name) throw new HttpError(400, "name is required");
      const { data, error } = await db
        .from("ebd_classes")
        .insert({
          name: body.name,
          age_range: body.age_range ?? null,
          sort_order: body.sort_order ?? 0,
          active: body.active ?? true,
        })
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, { action: "create", entity: "ebd_classes", entityId: data.id, after: data });
      return jsonResponse(req, 201, data);
    }

    if (req.method === "PATCH" && id) {
      const { data: before } = await db.from("ebd_classes").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "class not found");
      const body = await readJson<ClassInput>(req);
      const { data, error } = await db
        .from("ebd_classes")
        .update({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.age_range !== undefined && { age_range: body.age_range }),
          ...(body.sort_order !== undefined && { sort_order: body.sort_order }),
          ...(body.active !== undefined && { active: body.active }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, { action: "update", entity: "ebd_classes", entityId: id, before, after: data });
      return jsonResponse(req, 200, data);
    }

    if (req.method === "DELETE" && id) {
      const { data: before } = await db.from("ebd_classes").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "class not found");
      const { error } = await db.from("ebd_classes").delete().eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, { action: "delete", entity: "ebd_classes", entityId: id, before });
      return jsonResponse(req, 204, null);
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
