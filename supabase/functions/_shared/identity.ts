// Identity resolution (PROMPT.md section 5) — the ONLY place that reads who is
// calling. Three ways in, deliberately kept behind this one function:
//
//   1. `x-ms-token`     — a Microsoft Entra ID token (the church M365 account)
//   2. `x-google-token` — a Google ID token (e.g. a personal Gmail)
//   3. `x-access-token` — the ministry's secret link
//      (`?token=` for calendar clients that cannot send headers)
//
// Permissions are NEVER read from the token: the two personal doors find the
// person by email (email or email_alt) and derive scope from their ministries,
// so every door grants exactly the same powers.

import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import { serviceClient } from "./supabase.ts";
import { sha256Hex } from "./crypto.ts";
import { HttpError } from "./http.ts";

export type Scope = "admin" | "ministry" | "readonly";

export interface Identity {
  /** access_tokens.id, or null for a Microsoft sign-in. */
  tokenId: string | null;
  /** Rate-limit bucket: the token id, or the person's id. */
  rateKey: string;
  /** Primary ministry (first) — used for audit context. */
  ministryId: string | null;
  /** Every ministry this identity may write to. */
  ministryIds: string[];
  scope: Scope;
  personId: string | null;
  displayName: string | null;
}

const MS_TENANT_ID = Deno.env.get("MS_TENANT_ID") ?? "";
const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";

// Entra ID's signing keys, cached by `jose` between requests.
const jwks = MS_TENANT_ID
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${MS_TENANT_ID}/discovery/v2.0/keys`))
  : null;

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function extractToken(req: Request): string | null {
  const header = req.headers.get("x-access-token");
  if (header && header.length > 0) return header;
  // Calendar clients (ICS) cannot send custom headers.
  const q = new URL(req.url).searchParams.get("token");
  return q && q.length > 0 ? q : null;
}

/** Verifies a Microsoft ID token and returns the signed-in email. */
async function verifyMicrosoftToken(token: string): Promise<{ email: string; name: string | null }> {
  if (!jwks || !MS_CLIENT_ID) throw new HttpError(503, "Microsoft sign-in is not configured");
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, jwks, {
      issuer: `https://login.microsoftonline.com/${MS_TENANT_ID}/v2.0`,
      audience: MS_CLIENT_ID,
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new HttpError(401, "invalid Microsoft token");
  }
  const email = String(payload.email ?? payload.preferred_username ?? "").toLowerCase();
  if (!email) throw new HttpError(401, "Microsoft token has no email");
  return { email, name: (payload.name as string | undefined) ?? null };
}

/**
 * Ministries a person belongs to, and the scope that follows:
 *   - member of a ministry flagged `grants_admin` (Presbitério, Secretariado)
 *     -> admin
 *   - anyone else with ministries -> ministry scope over those ministries
 *   - known person with no ministry -> readonly
 */
async function scopeForPerson(
  db: SupabaseClient,
  personId: string,
): Promise<{ scope: Scope; ministryIds: string[] }> {
  const { data } = await db
    .from("ministry_members")
    .select("ministry_id, ministries!inner(grants_admin)")
    .eq("person_id", personId);

  const rows = (data ?? []) as { ministry_id: string; ministries: { grants_admin: boolean } | null }[];
  const ministryIds = rows.map((r) => r.ministry_id);
  if (rows.some((r) => r.ministries?.grants_admin)) return { scope: "admin", ministryIds };
  if (ministryIds.length > 0) return { scope: "ministry", ministryIds };
  return { scope: "readonly", ministryIds: [] };
}

/** Verifies a Google ID token ("Sign in with Google") and returns its email. */
async function verifyGoogleToken(token: string): Promise<{ email: string; name: string | null }> {
  if (!GOOGLE_CLIENT_ID) throw new HttpError(503, "Google sign-in is not configured");
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: GOOGLE_CLIENT_ID,
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new HttpError(401, "invalid Google token");
  }
  // An unverified address could be anyone's: never match a person on it.
  if (payload.email_verified !== true) throw new HttpError(401, "Google email is not verified");
  const email = String(payload.email ?? "").toLowerCase();
  if (!email) throw new HttpError(401, "Google token has no email");
  return { email, name: (payload.name as string | undefined) ?? null };
}

async function identityFromMicrosoft(db: SupabaseClient, token: string): Promise<Identity> {
  return identityFromEmail(db, await verifyMicrosoftToken(token));
}

async function identityFromGoogle(db: SupabaseClient, token: string): Promise<Identity> {
  return identityFromEmail(db, await verifyGoogleToken(token));
}

async function identityFromEmail(
  db: SupabaseClient,
  { email, name }: { email: string; name: string | null },
): Promise<Identity> {
  // Match either address: people may sign in with their institutional or their
  // personal email (email_alt). The match must be EXACT (case aside): `ilike`
  // treats "_" as a wildcard, so "ana_faia@x.pt" would otherwise pass for
  // "ana.faia@x.pt". Characters that could alter the filter are refused.
  if (!/^[^\s,()"\\%*]+@[^\s,()"\\%*@]+$/.test(email)) {
    throw new HttpError(403, `A conta ${email} não está associada a nenhuma pessoa.`);
  }
  const { data: candidates } = await db
    .from("people")
    .select("id, full_name, active, email, email_alt")
    .or(`email.ilike.${email},email_alt.ilike.${email}`)
    .limit(20);
  const same = (v: unknown) => typeof v === "string" && v.trim().toLowerCase() === email;
  const person = (candidates ?? []).find((p) => same(p.email) || same(p.email_alt)) ?? null;

  if (!person) {
    throw new HttpError(403, `A conta ${email} não está associada a nenhuma pessoa. Pede ao Presbitério para a associar.`);
  }
  if (person.active === false) throw new HttpError(403, "Esta pessoa está inativa.");

  const { scope, ministryIds } = await scopeForPerson(db, person.id as string);
  return {
    tokenId: null,
    rateKey: `person:${person.id}`,
    ministryId: ministryIds[0] ?? null,
    ministryIds,
    scope,
    personId: person.id as string,
    displayName: (person.full_name as string) ?? name,
  };
}

async function identityFromAccessToken(db: SupabaseClient, token: string): Promise<Identity | null> {
  const tokenHash = await sha256Hex(token);
  const { data, error } = await db
    .from("access_tokens")
    .select("id, ministry_id, scope, label")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw new HttpError(500, "auth lookup failed");
  if (!data) return null;

  // Best-effort last_used_at; never block the request on it.
  await db
    .from("access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  const ministryId = data.ministry_id as string | null;
  return {
    tokenId: data.id as string,
    rateKey: data.id as string,
    ministryId,
    ministryIds: ministryId ? [ministryId] : [],
    scope: data.scope as Scope,
    personId: null,
    displayName: (data.label as string | null) ?? null,
  };
}

export async function resolveIdentity(req: Request): Promise<Identity | null> {
  const db = serviceClient();

  const msToken = req.headers.get("x-ms-token");
  if (msToken) return await identityFromMicrosoft(db, msToken);

  const googleToken = req.headers.get("x-google-token");
  if (googleToken) return await identityFromGoogle(db, googleToken);

  const token = extractToken(req);
  if (!token) return null;
  return await identityFromAccessToken(db, token);
}

export async function requireIdentity(req: Request): Promise<Identity> {
  const identity = await resolveIdentity(req);
  if (!identity) throw new HttpError(401, "invalid or missing access token");
  return identity;
}
