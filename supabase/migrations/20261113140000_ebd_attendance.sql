-- Sunday School attendance (2026-11-13): each class keeps a list of children;
-- after a lesson the teachers tick who came. Children are minors, so this is
-- only reachable through the ebd-attendance function by a signed-in EBD member
-- (Microsoft or Google) or the Presbitério — never through the open sign-up.
-- Data kept to the minimum: a name and a class.

create table if not exists ebd_children (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  ebd_class_id uuid not null references ebd_classes (id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ebd_children_class_idx on ebd_children (ebd_class_id);

create table if not exists ebd_attendance (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  ebd_class_id uuid not null references ebd_classes (id) on delete cascade,
  child_id uuid not null references ebd_children (id) on delete cascade,
  recorded_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (service_id, child_id)
);
create index if not exists ebd_attendance_service_idx on ebd_attendance (service_id);

-- Deny-all: only the Edge Functions (service_role) read and write.
alter table ebd_children enable row level security;
alter table ebd_attendance enable row level security;
