// POST /auth/resolve -> { ministry, ministries[], scope, permissions[], person }
// (PROMPT.md section 6). A link token carries one ministry; a Microsoft sign-in
// may carry several, hence `ministries`.

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
      enforceRateLimit(identity.rateKey);

      const db = serviceClient();
      let ministries: unknown[] = [];
      if (identity.ministryIds.length > 0) {
        const { data } = await db
          .from("ministries")
          .select("id, slug, name, color")
          .in("id", identity.ministryIds)
          .order("sort_order");
        ministries = data ?? [];
      }

      return jsonResponse(req, 200, {
        // `ministry` is the primary one (all a link token ever has).
        ministry: ministries[0] ?? null,
        ministries,
        scope: identity.scope,
        permissions: permissionsFor(identity),
        person: identity.personId
          ? { id: identity.personId, full_name: identity.displayName }
          : null,
      });
    }

    throw new HttpError(404, "not found");
  } catch (err) {
    return errorResponse(req, err);
  }
});
