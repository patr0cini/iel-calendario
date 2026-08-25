-- A dedicated pool of who may preach. Membership of any ministry flagged
-- `supplies_preachers` makes a person an eligible preacher (kept out of the auth
-- code, same pattern as grants_admin). The new "Pregadores" ministry is that
-- pool; Presbitério and Convidados keep supplying preachers too.
alter table ministries add column if not exists supplies_preachers boolean not null default false;

insert into ministries (slug, name, color, sort_order, category)
values ('pregadores', 'Pregadores', '#0e7490', 12, 'ministerio')
on conflict (slug) do nothing;

update ministries set supplies_preachers = true
where slug in ('pregadores', 'presbiterio', 'convidados');
