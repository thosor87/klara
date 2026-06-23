create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  reason      text not null default '',
  reported_by uuid references users(id),
  status      text not null default 'open' check (status in ('open','answered','ignored','trashed')),
  response    text not null default '',
  created_at  timestamptz not null default now(),
  trashed_at  timestamptz
);
create index if not exists reports_status_idx on reports (status);
create index if not exists reports_item_idx on reports (item_id);
