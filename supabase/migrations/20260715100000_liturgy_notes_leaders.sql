-- Liturgy order, ministry notes and ministry leaders.

-- 1. Sermon auxiliary texts (alongside the main scripture).
alter table services add column if not exists scripture_aux text;

-- 2. Liturgy moments: welcome, reading+prayer, offering, announcements,
--    farewell. Each has a person in charge and a free-text note; the reading
--    also carries its scripture. One row per (service, moment).
create table if not exists service_moments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  moment text not null,
  person_id uuid references people (id) on delete set null,
  scripture text,
  notes text,
  unique (service_id, moment)
);
create index if not exists service_moments_service_idx on service_moments (service_id);

-- 3. Ministry notes: pinned to one service, or recurring when service_id is
--    null ("repetir sempre" — shows on every service until deleted).
create table if not exists ministry_notes (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries (id) on delete cascade,
  service_id uuid references services (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists ministry_notes_ministry_idx on ministry_notes (ministry_id);
create index if not exists ministry_notes_service_idx on ministry_notes (service_id);

-- 4. Ministry leaders (a ministry may have several).
alter table ministry_members add column if not exists is_leader boolean not null default false;

-- Deny-all: only the service_role (Edge Functions) reaches these.
alter table service_moments enable row level security;
alter table ministry_notes enable row level security;
