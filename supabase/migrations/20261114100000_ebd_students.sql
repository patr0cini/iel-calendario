-- EBD students' record (2026-11-14): the children list becomes a small file
-- per child, imported from the parents' contacts sheet and kept up to date by
-- the team. Still only reachable through ebd-attendance (personal sign-in of
-- an EBD member or the Presbitério).
--
--  - class is optional: a child may be waiting for a teacher to place them;
--  - visitor = a child who came once; never offered again for attendance.

alter table ebd_children alter column ebd_class_id drop not null;
alter table ebd_children add column if not exists birth_date date;
alter table ebd_children add column if not exists guardians text;   -- "Mãe - …\nPai - …"
alter table ebd_children add column if not exists contacts text;    -- phones / emails, free text
alter table ebd_children add column if not exists notes text;       -- allergies, remarks
alter table ebd_children add column if not exists visitor boolean not null default false;
