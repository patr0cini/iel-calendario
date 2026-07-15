export type Scope = "admin" | "ministry" | "readonly";

export type EventStatus = "proposta" | "confirmada" | "cancelada";

/** Not every row is a ministry: "outro" holds calendar buckets (Culto,
 *  Eventos) and people pools (Convidados). */
export type MinistryCategory = "ministerio" | "outro";

export interface Ministry {
  id: string;
  slug: string;
  name: string;
  color: string;
  sort_order: number;
  active: boolean;
  category: MinistryCategory;
}

export interface EventRow {
  id: string;
  ministry_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  status: EventStatus;
}

export interface AuthResolve {
  /** Primary ministry (all a link token ever has). */
  ministry: Pick<Ministry, "id" | "slug" | "name" | "color"> | null;
  /** Every ministry of this identity (a Microsoft sign-in may have several). */
  ministries: Pick<Ministry, "id" | "slug" | "name" | "color">[];
  scope: Scope;
  permissions: string[];
  person: { id: string; full_name: string | null } | null;
}

export interface EventInput {
  ministry_id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  location?: string | null;
  status?: EventStatus;
}

export type SongMoment = "abertura" | "adoracao" | "ceia" | "final" | "outro";

export interface MinistryRole {
  id: string;
  ministry_id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface Assignment {
  id: string;
  service_id: string;
  ministry_id: string;
  person_id: string | null;
  person_name: string | null;
  role: string;
  sort_order: number;
}

export interface Song {
  id: string;
  service_id: string;
  position: number;
  title: string;
  author: string | null;
  song_key: string | null;
  moment: SongMoment;
  link: string | null;
}

export interface EbdClass {
  id: string;
  name: string;
  age_range: string | null;
  sort_order: number;
  active: boolean;
}

export interface EbdAssignment {
  id: string;
  service_id: string;
  ebd_class_id: string;
  person_id: string | null;
  person_name: string | null;
  role: string;
  sort_order: number;
}

export interface ServiceHeader {
  id: string;
  service_date: string;
  service_time: string;
  label: string | null;
  theme: string | null;
  scripture: string | null;
  scripture_aux: string | null;
  preacher_id: string | null;
  leader_id: string | null;
  notes: string | null;
  ebd_theme: string | null;
  ebd_notes: string | null;
  preacher_name: string | null;
  leader_name: string | null;
}

export type MomentKey = "boas_vindas" | "leitura_oracao" | "oferta" | "anuncios" | "despedida";

export interface ServiceMoment {
  id: string;
  service_id: string;
  moment: MomentKey;
  person_id: string | null;
  person_name: string | null;
  scripture: string | null;
  notes: string | null;
}

export interface MinistryNote {
  id: string;
  ministry_id: string;
  /** null = recurring note ("repetir sempre"). */
  service_id: string | null;
  body: string;
  created_at: string;
}

export interface MinistryLeader {
  ministry_id: string;
  person_id: string;
  person_name: string | null;
}

export interface ServiceDetail {
  service: ServiceHeader;
  ministries: Ministry[];
  ministry_roles: MinistryRole[];
  assignments: Assignment[];
  songs: Song[];
  ebd_classes: EbdClass[];
  ebd_assignments: EbdAssignment[];
  unavailable_person_ids: string[];
  moments: ServiceMoment[];
  ministry_notes: MinistryNote[];
  leaders: MinistryLeader[];
}

export interface PersonLite {
  id: string;
  full_name: string;
}

export interface SongInput {
  position?: number;
  title: string;
  author?: string | null;
  song_key?: string | null;
  moment?: SongMoment;
  link?: string | null;
}

export interface AssignmentInput {
  person_id: string | null;
  role: string;
  sort_order?: number;
}

export interface PersonFull {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface TokenRecord {
  id: string;
  ministry_id: string | null;
  scope: Scope;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface AuditRow {
  id: string;
  at: string;
  token_id: string | null;
  ministry_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  token_label: string | null;
  token_scope: Scope | null;
  ministry_name: string | null;
}

export interface Unavailability {
  id: string;
  person_id: string;
  person_name: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
}

export interface SyncFailedEvent extends EventRow {
  sync_state: "pending" | "synced" | "failed" | "skipped";
  sync_attempts: number;
  sync_error: string | null;
}
