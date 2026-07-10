// Small lookup helpers shared by service-related routes.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./http.ts";
import type { Identity } from "./identity.ts";

export async function ministryIdBySlug(db: SupabaseClient, slug: string): Promise<string> {
  const { data } = await db.from("ministries").select("id").eq("slug", slug).maybeSingle();
  if (!data) throw new HttpError(404, `unknown ministry: ${slug}`);
  return data.id as string;
}

export async function ministrySlugById(db: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await db.from("ministries").select("slug").eq("id", id).maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

/** Songs are editable by admin or by the Louvor ministry only (PROMPT §5). */
export async function requireLouvorOrAdmin(db: SupabaseClient, identity: Identity): Promise<void> {
  if (identity.scope === "admin") return;
  if (identity.scope === "ministry" && identity.ministryId) {
    const slug = await ministrySlugById(db, identity.ministryId);
    if (slug === "louvor") return;
  }
  throw new HttpError(403, "only Louvor or admin may edit songs");
}
