-- Initial schema for the church ministry scheduling platform (PROMPT.md section 3).
-- All identifiers and comments are in English; user-facing text lives in the frontend.
--
-- Access invariant (PROMPT.md section 2): the browser never touches these tables.
-- RLS is enabled with NO policies, so `anon` and `authenticated` are denied
-- everything. Only the `service_role` (used inside Edge Functions) bypasses RLS.

-- Extensions -----------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Enums ----------------------------------------------------------------------
create type access_scope as enum ('admin', 'ministry', 'readonly');
create type event_status as enum ('proposta', 'confirmada', 'cancelada');
create type sync_state as enum ('pending', 'synced', 'failed', 'skipped');
create type song_moment as enum ('abertura', 'adoracao', 'ceia', 'final', 'outro');

-- Ministries -----------------------------------------------------------------
create table ministries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  color text not null, -- hex, e.g. '#2563eb'
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Editable set of functions/roles per ministry.
-- (PROMPT §13: the Presbitério must be able to edit these; not a fixed enum.)
create table ministry_roles (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ministry_id, name)
);

-- People ---------------------------------------------------------------------
create table people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table ministry_members (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  role text,
  unique (ministry_id, person_id)
);

-- Access tokens --------------------------------------------------------------
create table access_tokens (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid references ministries (id) on delete cascade, -- null when scope='admin'
  scope access_scope not null,
  token_hash text not null unique, -- SHA-256 of the clear token, hex
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- Events ---------------------------------------------------------------------
create table events (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries (id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  status event_status not null default 'proposta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_token uuid references access_tokens (id) on delete set null,
  -- Outlook sync (PROMPT §7)
  outlook_event_id text unique,
  sync_state sync_state not null default 'pending',
  sync_attempts int not null default 0,
  sync_error text,
  synced_at timestamptz,
  check (ends_at >= starts_at)
);
create index events_starts_at_idx on events (starts_at);
create index events_ministry_idx on events (ministry_id);
create index events_sync_pending_idx on events (updated_at) where sync_state = 'pending';

-- Services (Sunday worship) --------------------------------------------------
create table services (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_time time not null default '10:30',
  label text,
  theme text,
  scripture text,
  preacher_id uuid references people (id) on delete set null,
  leader_id uuid references people (id) on delete set null,
  notes text,
  unique (service_date, service_time)
);

create table service_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  ministry_id uuid not null references ministries (id) on delete cascade,
  person_id uuid references people (id) on delete set null, -- null = vacant slot
  role text not null,
  sort_order int not null default 0
);
create index service_assignments_service_idx on service_assignments (service_id);

create table service_songs (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  position int not null default 0,
  title text not null,
  author text,
  song_key text,
  moment song_moment not null default 'outro',
  link text
);
create index service_songs_service_idx on service_songs (service_id);

-- Sunday School (EBD) per-class scheduling (PROMPT §13: escalas por classe) ---
create table ebd_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  age_range text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table ebd_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  ebd_class_id uuid not null references ebd_classes (id) on delete cascade,
  person_id uuid references people (id) on delete set null, -- null = vacant slot
  role text not null default 'Professor',
  sort_order int not null default 0
);
create index ebd_assignments_service_idx on ebd_assignments (service_id);

-- Availability ---------------------------------------------------------------
create table unavailabilities (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  check (end_date >= start_date)
);
create index unavailabilities_person_idx on unavailabilities (person_id);

-- Audit ----------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  token_id uuid references access_tokens (id) on delete set null,
  ministry_id uuid references ministries (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb
);
create index audit_log_at_idx on audit_log (at desc);

-- Outbox: events deleted here that still have to be removed from Outlook -------
create table outbox (
  id uuid primary key default gen_random_uuid(),
  outlook_event_id text not null,
  deleted_at timestamptz not null default now(),
  processed_at timestamptz
);
create index outbox_unprocessed_idx on outbox (deleted_at) where processed_at is null;

-- Triggers -------------------------------------------------------------------

-- Keep updated_at fresh and flag events for Outlook re-sync when any syncable
-- column changes (PROMPT §7). Without this, edits never propagate to Outlook.
create or replace function events_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if (
    new.title, new.description, new.starts_at, new.ends_at,
    new.all_day, new.location, new.status
  ) is distinct from (
    old.title, old.description, old.starts_at, old.ends_at,
    old.all_day, old.location, old.status
  ) then
    new.sync_state := 'pending';
    new.sync_attempts := 0;
    new.sync_error := null;
  end if;
  return new;
end;
$$;

create trigger events_before_update
before update on events
for each row execute function events_before_update();

-- When an event that already reached Outlook is deleted, queue its removal.
-- Without this, deleting an event here leaves it alive in Outlook forever.
create or replace function events_after_delete() returns trigger
language plpgsql as $$
begin
  if old.outlook_event_id is not null then
    insert into outbox (outlook_event_id, deleted_at)
    values (old.outlook_event_id, now());
  end if;
  return old;
end;
$$;

create trigger events_after_delete
after delete on events
for each row execute function events_after_delete();

-- Insert one service per Sunday of the given year. Idempotent: running it twice
-- does not duplicate. Returns the number of services actually inserted.
create or replace function generate_sundays(p_year int) returns int
language plpgsql as $$
declare
  inserted int;
begin
  with sundays as (
    select d::date as service_date
    from generate_series(
      make_date(p_year, 1, 1),
      make_date(p_year, 12, 31),
      interval '1 day'
    ) as d
    where extract(isodow from d) = 7 -- ISO: Monday=1 .. Sunday=7
  ),
  ins as (
    insert into services (service_date, service_time)
    select service_date, time '10:30'
    from sundays
    on conflict (service_date, service_time) do nothing
    returning 1
  )
  select count(*) into inserted from ins;
  return inserted;
end;
$$;

-- Row Level Security: deny-all -----------------------------------------------
-- Enabling RLS with no policies denies every row to `anon` and `authenticated`.
-- The `service_role` used by the Edge Functions bypasses RLS.
alter table ministries enable row level security;
alter table ministry_roles enable row level security;
alter table people enable row level security;
alter table ministry_members enable row level security;
alter table access_tokens enable row level security;
alter table events enable row level security;
alter table services enable row level security;
alter table service_assignments enable row level security;
alter table service_songs enable row level security;
alter table ebd_classes enable row level security;
alter table ebd_assignments enable row level security;
alter table unavailabilities enable row level security;
alter table audit_log enable row level security;
alter table outbox enable row level security;
