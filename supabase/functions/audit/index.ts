// GET /audit?limit=&entity= (admin only). Returns recent audit entries enriched
// with token labels and ministry names for display.

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { requireScope } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { HttpError, errorResponse, jsonResponse, preflight } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.tokenId);
    requireScope(identity, "admin");
    if (req.method !== "GET") throw new HttpError(405, "method not allowed");

    const db = serviceClient();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
    const entity = url.searchParams.get("entity");

    let q = db.from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
    if (entity) q = q.eq("entity", entity);
    const { data: rows, error } = await q;
    if (error) throw new HttpError(500, error.message);

    const tokenIds = [...new Set((rows ?? []).map((r) => r.token_id).filter(Boolean))];
    const ministryIds = [...new Set((rows ?? []).map((r) => r.ministry_id).filter(Boolean))];
    const [tokens, ministries] = await Promise.all([
      tokenIds.length
        ? db.from("access_tokens").select("id, label, scope").in("id", tokenIds)
        : Promise.resolve({ data: [] }),
      ministryIds.length
        ? db.from("ministries").select("id, name").in("id", ministryIds)
        : Promise.resolve({ data: [] }),
    ]);
    const tokenById = new Map((tokens.data ?? []).map((t) => [t.id, t]));
    const ministryById = new Map((ministries.data ?? []).map((m) => [m.id, m.name]));

    return jsonResponse(
      req,
      200,
      (rows ?? []).map((r) => ({
        ...r,
        token_label: r.token_id ? tokenById.get(r.token_id)?.label ?? null : null,
        token_scope: r.token_id ? tokenById.get(r.token_id)?.scope ?? null : null,
        ministry_name: r.ministry_id ? ministryById.get(r.ministry_id) ?? null : null,
      })),
    );
  } catch (err) {
    return errorResponse(req, err);
  }
});
