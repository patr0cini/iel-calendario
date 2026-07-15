-- Which ministries grant platform admin. Presbitério runs the church and the
-- Secretariado runs the paperwork, so both administer the calendar. A flag
-- keeps this out of the auth code and lets the Presbitério change it later.
alter table ministries add column if not exists grants_admin boolean not null default false;

update ministries set grants_admin = true where slug in ('presbiterio', 'secretariado');
