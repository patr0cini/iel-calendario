-- Seed data. Safe to run repeatedly (uses ON CONFLICT).
-- No people or tokens are seeded: tokens are generated via the API and only
-- their SHA-256 hash is ever stored.

insert into ministries (slug, name, color, sort_order) values
  ('culto', 'Culto', '#a16207', 0), -- Sunday services take this color/filter in the calendar
  ('presbiterio', 'Presbitério', '#7c3aed', 1),
  ('louvor', 'Louvor', '#2563eb', 2),
  ('multimedia', 'Multimédia', '#059669', 3),
  ('assistentes', 'Assistentes', '#d97706', 4),
  ('ebd', 'Escola Bíblica Dominical', '#dc2626', 5),
  ('412', '412 (Adolescentes e Jovens)', '#db2777', 6)
on conflict (slug) do nothing;

-- Ministry roles (editable by the Presbitério later — PROMPT §13).
-- "Partilha da Ceia" belongs to Presbitério: first Sundays are communion services.
insert into ministry_roles (ministry_id, name, sort_order)
select m.id, r.name, r.sort_order
from ministries m
join (values
  ('presbiterio', 'Partilha da Ceia', 1),
  ('louvor', 'Dirigente', 1),
  ('louvor', 'Voz', 2),
  ('louvor', 'Teclas', 3),
  ('louvor', 'Guitarra', 4),
  ('louvor', 'Baixo', 5),
  ('louvor', 'Bateria', 6),
  ('multimedia', 'Projeção', 1),
  ('multimedia', 'Som', 2),
  ('multimedia', 'Vídeo', 3),
  ('assistentes', 'Acolhimento', 1),
  ('assistentes', 'Oferta', 2),
  ('assistentes', 'Ceia', 3)
) as r (slug, name, sort_order) on r.slug = m.slug
on conflict (ministry_id, name) do nothing;

-- Sunday School classes (per-class scheduling). Placeholder set; admin edits.
insert into ebd_classes (name, age_range, sort_order) values
  ('Berçário', '0-3', 1),
  ('Infantil', '4-8', 2),
  ('Juniores', '9-12', 3),
  ('Adolescentes', '13-17', 4),
  ('Adultos', '18+', 5)
on conflict (name) do nothing;
