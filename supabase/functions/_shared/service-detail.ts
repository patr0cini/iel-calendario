// Full order-of-service detail, shared by the /services API and the public
// /share page. Person names are resolved server-side so callers never need the
// people directory.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

export async function buildDetail(db: SupabaseClient, serviceId: string) {
  const { data: service } = await db.from("services").select("*").eq("id", serviceId).maybeSingle();
  if (!service) throw new HttpError(404, "service not found");

  const [
    people,
    ministries,
    roles,
    assignments,
    songs,
    ebdClasses,
    ebdAssignments,
    unavail,
    moments,
    notes,
    leaders,
  ] = await Promise.all([
    db.from("people").select("id, full_name"),
    db.from("ministries").select("id, slug, name, color, sort_order, category").order("sort_order"),
    db.from("ministry_roles").select("*").eq("active", true).order("sort_order"),
    db.from("service_assignments").select("*").eq("service_id", serviceId).order("sort_order"),
    db.from("service_songs").select("*").eq("service_id", serviceId).order("position"),
    db.from("ebd_classes").select("*").eq("active", true).order("sort_order"),
    db.from("ebd_assignments").select("*").eq("service_id", serviceId).order("sort_order"),
    db
      .from("unavailabilities")
      .select("person_id")
      .lte("start_date", service.service_date)
      .gte("end_date", service.service_date),
    db.from("service_moments").select("*").eq("service_id", serviceId),
    // This service's notes plus the recurring ones (service_id is null).
    db.from("ministry_notes").select("*").or(`service_id.eq.${serviceId},service_id.is.null`).order("created_at"),
    db.from("ministry_members").select("ministry_id, person_id").eq("is_leader", true),
  ]);

  const nameById = new Map((people.data ?? []).map((p) => [p.id as string, p.full_name as string]));
  const withName = <T extends { person_id: string | null }>(row: T) => ({
    ...row,
    person_name: row.person_id ? nameById.get(row.person_id) ?? null : null,
  });

  return {
    service: {
      ...service,
      preacher_name: service.preacher_id ? nameById.get(service.preacher_id) ?? null : null,
      leader_name: service.leader_id ? nameById.get(service.leader_id) ?? null : null,
    },
    ministries: ministries.data ?? [],
    ministry_roles: roles.data ?? [],
    assignments: (assignments.data ?? []).map(withName),
    songs: songs.data ?? [],
    ebd_classes: ebdClasses.data ?? [],
    ebd_assignments: (ebdAssignments.data ?? []).map(withName),
    unavailable_person_ids: [...new Set((unavail.data ?? []).map((u) => u.person_id as string))],
    moments: (moments.data ?? []).map(withName),
    ministry_notes: notes.data ?? [],
    leaders: (leaders.data ?? []).map((l) => ({
      ministry_id: l.ministry_id as string,
      person_id: l.person_id as string,
      person_name: nameById.get(l.person_id as string) ?? null,
    })),
  };
}

export type ServiceDetail = Awaited<ReturnType<typeof buildDetail>>;

/** First Sunday of the month = communion service. */
export function isFirstSundayOfMonth(serviceDate: string): boolean {
  return Number(String(serviceDate).slice(8, 10)) <= 7;
}
