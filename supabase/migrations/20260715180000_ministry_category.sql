-- Not every row in `ministries` is a ministry: some are calendar buckets
-- ("Culto") or people pools ("Convidados"). A category keeps them apart in the
-- filter, the rosters and the admin, without splitting the table.
alter table ministries
  add column if not exists category text not null default 'ministerio'
  check (category in ('ministerio', 'outro'));

update ministries set category = 'outro' where slug in ('culto', 'convidados', 'eventos');
