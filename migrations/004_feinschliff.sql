-- Plan 5: Feinschliff
-- Ordner: Titelbild, Datumsbereich, manuelle Reihenfolge
alter table folders add column if not exists cover_item_id uuid references items(id) on delete set null;
alter table folders add column if not exists start_date date;
alter table folders add column if not exists end_date   date;
alter table folders add column if not exists sort_order int not null default 0;

-- Admin-pflegbare Login-Domains (#6)
create table if not exists allowed_domains (
  domain     text primary key,
  created_at timestamptz not null default now()
);
-- initial aus der bisherigen Env-Domain seeden
insert into allowed_domains (domain) values ('gs-alexandersfeld.de') on conflict do nothing;

-- Admin-pflegbare Klassen-Werte (#9)
create table if not exists class_options (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into class_options (label, sort_order) values
  ('1. Klasse',1),('2. Klasse',2),('3. Klasse',3),('4. Klasse',4)
  on conflict do nothing;
