-- Sunday School lesson info per service: the EBD ministry records the lesson
-- theme and free-form notes for each Sunday.
alter table services
  add column if not exists ebd_theme text,
  add column if not exists ebd_notes text;
