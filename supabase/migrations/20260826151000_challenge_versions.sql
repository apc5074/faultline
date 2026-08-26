-- Immutable published challenge snapshots and daily schedule windows.

create extension if not exists btree_gist;

create table public.challenge_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version integer not null check (version >= 1),
  config_json jsonb not null,
  config_hash text not null,
  simulator_version text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint challenge_versions_slug_version_unique unique (slug, version),
  constraint challenge_versions_config_hash_unique unique (config_hash)
);

comment on table public.challenge_versions is
  'Immutable published ChallengeDefinition snapshots for official competition.';
comment on column public.challenge_versions.config_json is
  'Canonical challenge config snapshot from packages/challenges; never mutate after publish.';
comment on column public.challenge_versions.config_hash is
  'Deterministic SHA-256 of canonicalized config_json for audit/integrity.';
comment on column public.challenge_versions.simulator_version is
  'packages/simulator SIMULATOR_VERSION this snapshot was published against.';

create table public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_version_id uuid not null references public.challenge_versions (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  constraint daily_challenges_window_valid check (ends_at > starts_at),
  constraint daily_challenges_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
);

comment on table public.daily_challenges is
  'Server-timed windows mapping a challenge_version as the active official challenge.';

create or replace function public.prevent_challenge_version_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'challenge_versions rows are immutable; publish a new version instead';
end;
$$;

create trigger challenge_versions_immutable_update
  before update on public.challenge_versions
  for each row
  execute function public.prevent_challenge_version_update();

create or replace function public.prevent_referenced_challenge_version_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.daily_challenges
    where challenge_version_id = old.id
  ) then
    raise exception 'cannot delete challenge_versions referenced by daily_challenges';
  end if;
  return old;
end;
$$;

create trigger challenge_versions_protect_delete
  before delete on public.challenge_versions
  for each row
  execute function public.prevent_referenced_challenge_version_delete();

alter table public.challenge_versions enable row level security;
alter table public.daily_challenges enable row level security;

-- Readable by clients for display; writes are service-role only (bypasses RLS).
create policy "Challenge versions are publicly readable"
  on public.challenge_versions
  for select
  to anon, authenticated
  using (true);

create policy "Daily challenges are publicly readable"
  on public.daily_challenges
  for select
  to anon, authenticated
  using (true);
