// /tokens (PROMPT.md sections 6 & 9). Admin only.
//   GET                  -> list token metadata (never hashes)
//   POST                 -> create; returns the CLEAR token exactly once
//   PATCH /{id}/revoke   -> revoke
//
// Token material: 32 bytes from crypto.getRandomValues, base64url. Only the
// SHA-256 (hex) is stored. The clear token is never logged nor retrievable.

import { serviceClient } from "../_shared/supabase.ts";
import { requireIdentity } from "../_shared/identity.ts";
import { requireScope } from "../_shared/authz.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { HttpError, errorResponse, jsonResponse, pathSegments, preflight, readJson } from "../_shared/http.ts";

interface TokenInput {
  scope?: "admin" | "ministry" | "readonly";
  ministry_id?: string | null;
  label?: string | null;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

const SAFE_COLUMNS = "id, ministry_id, scope, label, created_at, last_used_at, revoked_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const identity = await requireIdentity(req);
    enforceRateLimit(identity.rateKey);
    requireScope(identity, "admin");
    const db = serviceClient();
    const seg = pathSegments(req, "tokens");

    if (req.method === "GET" && seg.length === 0) {
      const { data, error } = await db
        .from("access_tokens")
        .select(SAFE_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw new HttpError(500, error.message);
      return jsonResponse(req, 200, data);
    }

    if (req.method === "POST" && seg.length === 0) {
      const body = await readJson<TokenInput>(req);
      const scope = body.scope;
      if (!scope || !["admin", "ministry", "readonly"].includes(scope)) {
        throw new HttpError(400, "scope must be admin, ministry or readonly");
      }
      if (scope === "ministry" && !body.ministry_id) {
        throw new HttpError(400, "ministry_id is required for scope=ministry");
      }
      if (scope === "admin" && body.ministry_id) {
        throw new HttpError(400, "admin tokens cannot be tied to a ministry");
      }

      const clearToken = generateToken();
      const { data, error } = await db
        .from("access_tokens")
        .insert({
          scope,
          ministry_id: body.ministry_id ?? null,
          label: body.label ?? null,
          token_hash: await sha256Hex(clearToken),
        })
        .select(SAFE_COLUMNS)
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "create",
        entity: "access_tokens",
        entityId: data.id,
        after: data, // safe columns only — never the hash or clear token
        ministryId: body.ministry_id ?? null,
      });
      // The one and only time the clear token leaves the server.
      return jsonResponse(req, 201, { ...data, token: clearToken });
    }

    if (req.method === "PATCH" && seg.length === 2 && seg[1] === "revoke") {
      const id = seg[0];
      const { data: before } = await db
        .from("access_tokens")
        .select(SAFE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (!before) throw new HttpError(404, "token not found");
      if (before.revoked_at) throw new HttpError(400, "token already revoked");
      const { data, error } = await db
        .from("access_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .select(SAFE_COLUMNS)
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(db, identity, {
        action: "update",
        entity: "access_tokens",
        entityId: id,
        before,
        after: data,
        ministryId: (before.ministry_id as string | null) ?? null,
      });
      return jsonResponse(req, 200, data);
    }

    throw new HttpError(405, "method not allowed");
  } catch (err) {
    return errorResponse(req, err);
  }
});
