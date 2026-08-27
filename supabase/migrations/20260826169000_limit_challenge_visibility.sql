-- A browser-safe Supabase key can query PostgREST directly. Limit table access
-- to the one challenge currently intended for public play; future and historical
-- schedules/configurations stay server-only.

drop policy if exists "Challenge versions are publicly readable" on public.challenge_versions;
drop policy if exists "Daily challenges are publicly readable" on public.daily_challenges;

create policy "Active daily challenge is publicly readable"
  on public.daily_challenges
  for select
  to anon, authenticated
  using (starts_at <= now() and ends_at > now());

create policy "Active challenge version is publicly readable"
  on public.challenge_versions
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.daily_challenges as dc
      where dc.challenge_version_id = challenge_versions.id
        and dc.starts_at <= now()
        and dc.ends_at > now()
    )
  );

comment on table public.challenge_versions is
  'Immutable published ChallengeDefinition snapshots. Only the version active under the database clock is publicly readable.';
comment on table public.daily_challenges is
  'Server-timed schedule windows. Only the window active under the database clock is publicly readable.';
