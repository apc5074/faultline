-- Competition profiles: stable public alias for anonymous (and later linked) users.
-- Alias is generated once at profile creation and never derived from UUID/PII.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint profiles_alias_format check (alias ~ '^[A-Z][a-z]+[A-Z][a-z]+[0-9]{2}$'),
  constraint profiles_alias_unique unique (alias)
);

comment on table public.profiles is 'Minimal competition identity; alias is public-safe and stable.';
comment on column public.profiles.alias is 'Adjective+Noun+2 digits; unique; not derived from UUID or PII.';

alter table public.profiles enable row level security;

-- Leaderboards and HUD need aliases without exposing auth.users.
create policy "Profiles aliases are publicly readable"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- Authenticated players may create only their own profile row.
create policy "Players insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No update/delete policies in Phase 4 — aliases are immutable here.
