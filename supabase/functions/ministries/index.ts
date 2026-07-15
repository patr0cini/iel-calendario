// /ministries (PROMPT.md section 6).
//   GET            -> list (any scope)
//   POST           -> create (admin)
//   PATCH  /{id}   -> update (admin)
//   DELETE /{id}   -> delete (admin)

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { requireScope } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";

interface MinistryInput {
  slug?: string;
  name?: string;
  color?: string;
  sort_order?: number;
  active?: boolean;
  /** "outro" = calendar bucket or people pool, not a ministry with a roster. */
  category?: "ministerio" | "outro";
}

interface RoleInput {
  name: string;
  sort_order?: number;
  active?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.rateKey);
    const db = serviceClient();
    const seg = pathSegments(req, "ministries");
    const id = seg[0];

    // /ministries/{id}/leaders — a ministry may have several leaders.
    // Stored as `is_leader` on ministry_members (a leader is always a member).
    if (seg.length === 2 && seg[1] === "leaders") {
      if (req.method === "GET") {
        const { data, error } = await db
          .from("ministry_members")
          .select("person_id, people(full_name)")
          .eq("ministry_id", id)
          .eq("is_leader", true);
        if (error) throw new HttpError(500, error.message);
        return jsonResponse(
          req,
          200,
          (data ?? []).map((r) => {
            const { people, ...rest } = r as Record<string, unknown> & { people: { full_name: string } | null };
            return { ...rest, full_name: people?.full_name ?? null };
          }),
        );
      }
      if (req.method === "PUT") {
        requireScope(identity, "admin");
        const body = await readJson<{ person_ids: string[] }>(req);
        if (!Array.isArray(body.person_ids)) throw new HttpError(400, "person_ids array is required");
        const { data: ministry } = await db.from("ministries").select("id").eq("id", id).maybeSingle();
        if (!ministry) throw new HttpError(404, "ministry not found");
        // Leaders must be members: add any that are missing.
        if (body.person_ids.length > 0) {
          const rows = body.person_ids.map((person_id) => ({ ministry_id: id, person_id }));
          const { error } = await db
            .from("ministry_members")
            .upsert(rows, { onConflict: "ministry_id,person_id", ignoreDuplicates: true });
          if (error) throw new HttpError(400, error.message);
        }
        await db.from("ministry_members").update({ is_leader: false }).eq("ministry_id", id);
        if (body.person_ids.length > 0) {
          const { error } = await db
            .from("ministry_members")
            .update({ is_leader: true })
            .eq("ministry_id", id)
            .in("person_id", body.person_ids);
          if (error) throw new HttpError(400, error.message);
        }
        await writeAudit(db, identity, {
          action: "update",
          entity: "ministry_leaders",
          entityId: id,
          after: body.person_ids,
          ministryId: id,
        });
        return jsonResponse(req, 200, { ministry_id: id, person_ids: body.person_ids });
      }
      throw new HttpError(405, "method not allowed");
    }

    // /ministries/{id}/roles — the editable set of functions per ministry
    // (PROMPT §13: the Presbitério manages these; never a hardcoded enum).
    if (seg.length === 2 && seg[1] === "roles") {
      if (req.method === "GET") {
        const { data, error } = await db
          .from("ministry_roles")
          .select("*")
          .eq("ministry_id", id)
          .order("sort_order");
        if (error) throw new HttpError(500, error.message);
        return jsonResponse(req, 200, data);
      }
      if (req.method === "PUT") {
        requireScope(identity, "admin");
        const body = await readJson<{ roles: RoleInput[] }>(req);
        if (!Array.isArray(body.roles)) throw new HttpError(400, "roles array is required");
        const { data: ministry } = await db.from("ministries").select("id").eq("id", id).maybeSingle();
        if (!ministry) throw new HttpError(404, "ministry not found");
        const { data: before } = await db.from("ministry_roles").select("*").eq("ministry_id", id);
        await db.from("ministry_roles").delete().eq("ministry_id", id);
        if (body.roles.length > 0) {
          const rows = body.roles
            .filter((r) => r.name?.trim())
            .map((r, i) => ({
              ministry_id: id,
              name: r.name.trim(),
              sort_order: r.sort_order ?? i,
              active: r.active ?? true,
            }));
          const { error } = await db.from("ministry_roles").insert(rows);
          if (error) throw new HttpError(400, error.message);
        }
        const { data } = await db.from("ministry_roles").select("*").eq("ministry_id", id).order("sort_order");
        await writeAudit(db, identity, {
          action: "update",
          entity: "ministry_roles",
          entityId: id,
          before,
          after: data,
          ministryId: id,
        });
        return jsonResponse(req, 200, data);
      }
      throw new HttpError(405, "method not allowed");
    }

    if (req.method === "GET" && !id) {
      const { data, error } = await db.from("ministries").select("*").order("sort_order");
      if (error) throw new HttpError(500, error.message);
      return jsonResponse(req, 200, data);
    }

    if (req.method === "POST" && !id) {
      requireScope(identity, "admin");
      const body = await readJson<MinistryInput>(req);
      if (!body.slug || !body.name || !body.color) {
        throw new HttpError(400, "slug, name and color are required");
      }
      const { data, error } = await db
        .from("ministries")
        .insert({
          slug: body.slug,
          name: body.name,
          color: body.color,
          sort_order: body.sort_order ?? 0,
          active: body.active ?? true,
          category: body.category ?? "ministerio",
        })
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "create",
        entity: "ministries",
        entityId: data.id,
        after: data,
        ministryId: data.id,
      });
      return jsonResponse(req, 201, data);
    }

    if (req.method === "PATCH" && id) {
      requireScope(identity, "admin");
      const body = await readJson<MinistryInput>(req);
      const { data: before } = await db.from("ministries").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "ministry not found");
      const { data, error } = await db
        .from("ministries")
        .update({
          ...(body.slug !== undefined && { slug: body.slug }),
          ...(body.name !== undefined && { name: body.name }),
          ...(body.color !== undefined && { color: body.color }),
          ...(body.sort_order !== undefined && { sort_order: body.sort_order }),
          ...(body.active !== undefined && { active: body.active }),
          ...(body.category !== undefined && { category: body.category }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "update",
        entity: "ministries",
        entityId: id,
        before,
        after: data,
        ministryId: id,
      });
      return jsonResponse(req, 200, data);
    }

    if (req.method === "DELETE" && id) {
      requireScope(identity, "admin");
      const { data: before } = await db.from("ministries").select("*").eq("id", id).maybeSingle();
      if (!before) throw new HttpError(404, "ministry not found");
      const { error } = await db.from("ministries").delete().eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "delete",
        entity: "ministries",
        entityId: id,
        before,
        ministryId: id,
      });
      return jsonResponse(req, 204, null);
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
