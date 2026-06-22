create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  role       text not null default 'member' check (role in ('admin','member')),
  status     text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now()
);

create table if not exists login_tokens (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  code_hash       text not null,
  link_token_hash text not null,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  attempts        int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists login_tokens_email_idx on login_tokens (email);
