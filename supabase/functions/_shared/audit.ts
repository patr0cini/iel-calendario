// Every write goes through the audit log (PROMPT.md section 6).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Identity } from "./identity.ts";

export interface AuditEntry {
  action: "create" | "update" | "delete";
  entity: string; // table name
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ministryId?: string | null;
}

export async function writeAudit(
  db: SupabaseClient,
  identity: Identity,
  e: AuditEntry,
): Promise<void> {
  await db.from("audit_log").insert({
    token_id: identity.tokenId,
    ministry_id: e.ministryId ?? identity.ministryId,
    action: e.action,
    entity: e.entity,
    entity_id: e.entityId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
  });
}
