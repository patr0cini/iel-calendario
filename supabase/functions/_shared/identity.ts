// Identity resolution (PROMPT.md section 5).
//
// resolveIdentity() is the ONLY place that reads the token. Today it reads the
// `x-access-token` header (and `?token=` for calendar clients that cannot send
// headers). If the church ever wants real login, replace this function and
// nothing else — permissions are NOT coupled to the token.

import { serviceClient } from "./supabase.ts";
import { sha256Hex } from "./crypto.ts";
import { HttpError } from "./http.ts";

export type Scope = "admin" | "ministry" | "readonly";

export interface Identity {
  tokenId: string;
  ministryId: string | null;
  scope: Scope;
}

export function extractToken(req: Request): string | null {
  const header = req.headers.get("x-access-token");
  if (header && header.length > 0) return header;
  // Calendar clients (ICS, Phase 5) cannot send custom headers.
  const q = new URL(req.url).searchParams.get("token");
  return q && q.length > 0 ? q : null;
}

export async function resolveIdentity(req: Request): Promise<Identity | null> {
  const token = extractToken(req);
  if (!token) return null;

  const db = serviceClient();
  const tokenHash = await sha256Hex(token);

  const { data, error } = await db
    .from("access_tokens")
    .select("id, ministry_id, scope, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw new HttpError(500, "auth lookup failed");
  if (!data) return null;

  // Best-effort last_used_at update; never block the request on it.
  await db
    .from("access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    tokenId: data.id as string,
    ministryId: data.ministry_id as string | null,
    scope: data.scope as Scope,
  };
}

export async function requireIdentity(req: Request): Promise<Identity> {
  const identity = await resolveIdentity(req);
  if (!identity) throw new HttpError(401, "invalid or missing access token");
  return identity;
}
