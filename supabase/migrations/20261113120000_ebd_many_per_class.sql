-- EBD sign-up: several teachers per class (changed from one, 2026-11-13).
-- Joining is idempotent: the same person is never listed twice in a class,
-- even if they tap twice or two tabs race (advisory lock per class + Sunday).

create or replace function ebd_join_class(
  p_service uuid,
  p_class uuid,
  p_person uuid
) returns text
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_service::text || ':' || p_class::text, 0));

  if exists (
    select 1 from ebd_assignments
    where service_id = p_service and ebd_class_id = p_class and person_id = p_person
  ) then
    return 'already';
  end if;

  insert into ebd_assignments (service_id, ebd_class_id, person_id, role, sort_order)
  select p_service, p_class, p_person, 'Professor', coalesce(max(sort_order) + 1, 0)
  from ebd_assignments
  where service_id = p_service and ebd_class_id = p_class;
  return 'ok';
end;
$$;

revoke all on function ebd_join_class(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function ebd_join_class(uuid, uuid, uuid) to service_role;

-- The one-per-class version is no longer used.
drop function if exists ebd_claim_slot(uuid, uuid, uuid, boolean);
