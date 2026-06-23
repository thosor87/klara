-- Plan 6: Klassen-basierte Berechtigung
-- Person -> genau eine Klasse (null = noch nicht zugeordnet)
alter table users add column if not exists class_id uuid references class_options(id) on delete set null;

-- Album -> mehrere Klassen
create table if not exists folder_classes (
  folder_id uuid not null references folders(id) on delete cascade,
  class_id  uuid not null references class_options(id) on delete cascade,
  primary key (folder_id, class_id)
);
create index if not exists folder_classes_class_idx on folder_classes (class_id);

-- Bestandsdaten: Album dessen class_label zu einer class_options.label passt → Zuordnung übernehmen
insert into folder_classes (folder_id, class_id)
  select f.id, c.id from folders f
  join class_options c on c.label = f.class_label
  on conflict do nothing;
