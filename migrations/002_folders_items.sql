create table if not exists folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  school_year text not null default '',
  class_label text not null default '',
  enabled     boolean not null default true,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references folders(id) on delete cascade,
  type        text not null default 'photo' check (type in ('photo','document')),
  status      text not null default 'pending' check (status in ('pending','approved','trashed')),
  s3_key      text not null,
  thumb_key   text not null,
  caption     text not null default '',
  uploaded_by uuid references users(id),
  approved_by uuid references users(id),
  created_at  timestamptz not null default now(),
  trashed_at  timestamptz
);
create index if not exists items_folder_status_idx on items (folder_id, status);
create index if not exists items_status_idx on items (status);
