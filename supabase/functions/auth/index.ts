// POST /auth/resolve -> { ministry, scope, permissions[] } (PROMPT.md section 6).

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { permissionsFor } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const seg = pathSegments(req, "auth");

    if (seg[0] === "resolve" && req.method === "POST") {
      const identity = await requireIdentity(req);
      enforceRateLimit(identity.tokenId);

      const db = serviceClient();
      let ministry = null;
      if (identity.ministryId) {
        const { data } = await db
          .from("ministries")
          .select("id, slug, name, color")
          .eq("id", identity.ministryId)
          .maybeSingle();
        ministry = data;
      }

      return jsonResponse(req, 200, {
        ministry,
        scope: identity.scope,
        permissions: permissionsFor(identity),
      });
    }

    throw new HttpError(404, "not found");
  } catch (err) {
    return errorResponse(req, err);
  }
});
