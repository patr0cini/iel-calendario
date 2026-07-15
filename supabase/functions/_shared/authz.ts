// Authorization helpers (PROMPT.md section 5). Enforcement lives here and in the
// routes — hiding buttons in the UI is cosmetic. Permissions are derived from
// scope (and ministry), never read from the token itself.

import { HttpError } from "./http.ts";
import type { Identity, Scope } from "./identity.ts";

export function requireScope(identity: Identity, ...allowed: Scope[]): void {
  if (!allowed.includes(identity.scope)) {
    throw new HttpError(403, "insufficient scope");
  }
}

/**
 * Ministry-scoped write: admin may write to any ministry; a `ministry` identity
 * may write only to ministries it belongs to (a link token carries exactly one;
 * a Microsoft sign-in may carry several); `readonly` may never write.
 */
export function assertMinistryWrite(identity: Identity, ministryId: string): void {
  if (identity.scope === "admin") return;
  if (identity.scope === "ministry" && identity.ministryIds.includes(ministryId)) return;
  throw new HttpError(403, "cannot write to another ministry");
}

/** UI hints only. The server is the source of truth for every action. */
export function permissionsFor(identity: Identity): string[] {
  const p = ["events:read", "services:read", "people:read"];
  if (identity.scope === "admin") {
    p.push(
      "events:write:any",
      "services:edit",
      "assignments:write:any",
      "songs:write",
      "ministries:write",
      "people:write:any",
      "members:write:any",
      "tokens:write",
      "audit:read",
    );
  } else if (identity.scope === "ministry") {
    p.push(
      "events:write:own",
      "assignments:write:own",
      "people:write:own",
      "members:write:own",
    );
  }
  return p;
}
