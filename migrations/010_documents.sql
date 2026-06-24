-- Album documents: up to 10 admin-uploaded files per folder (any format),
-- visible to members of the album's class(es), shown atop the album view.
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  folder_id    uuid not null references folders(id) on delete cascade,
  filename     text not null,
  content_type text not null,
  size_bytes   bigint not null default 0,
  s3_key       text not null,
  uploaded_by  uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists documents_folder_idx on documents (folder_id);
