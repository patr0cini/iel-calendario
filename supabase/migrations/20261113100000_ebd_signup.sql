-- Self sign-up for the Sunday School (ebd.iel.pt): one teacher per class per
-- Sunday. The check-and-insert must be atomic, so it lives here behind an
-- advisory lock instead of in the Edge Function (two volunteers tapping the
-- same class at once must not both get it).
--
-- Returns 'ok' or 'taken'. p_replace lets a leader/admin swap the teacher.

create or replace function ebd_claim_slot(
  p_service uuid,
  p_class uuid,
  p_person uuid,
  p_replace boolean default false
) returns text
language plpgsql
as $$
declare
  current_person uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_service::text || ':' || p_class::text, 0));

  select person_id into current_person
  from ebd_assignments
  where service_id = p_service and ebd_class_id = p_class and person_id is not null
  order by sort_order
  limit 1;

  if current_person = p_person then
    return 'ok';
  end if;
  if current_person is not null and not p_replace then
    return 'taken';
  end if;

  delete from ebd_assignments where service_id = p_service and ebd_class_id = p_class;
  insert into ebd_assignments (service_id, ebd_class_id, person_id, role, sort_order)
  values (p_service, p_class, p_person, 'Professor', 0);
  return 'ok';
end;
$$;

-- Only the Edge Functions (service_role) may call it.
revoke all on function ebd_claim_slot(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function ebd_claim_slot(uuid, uuid, uuid, boolean) to service_role;
