-- Audit log: who did what, when. Admin-visible (bottom of the user management page).
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users(id) on delete set null,
  actor_email text not null,
  action      text not null,   -- machine key, e.g. 'login', 'user.activate', 'folder.delete'
  summary     text not null,   -- human-readable German
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at desc);
