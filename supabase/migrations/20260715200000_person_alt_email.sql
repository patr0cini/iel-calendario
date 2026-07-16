-- A second, personal address alongside the institutional @iel.pt one.
-- Microsoft sign-in matches either (see identity.ts), and contact lists can use
-- whichever reaches the person.
alter table people add column if not exists email_alt text;
