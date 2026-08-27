-- Profile aliases are public only through the deliberately shaped leaderboard
-- RPCs. Direct table reads would also expose stable auth user UUIDs.

drop policy if exists "Profiles aliases are publicly readable" on public.profiles;

-- Anonymous competition users receive the authenticated role after sign-in, so
-- this preserves alias creation/restore without permitting cross-player lookup.
create policy "Players read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.profiles is
  'Minimal competition identity. Direct reads are owner-only; public aliases are returned only by leaderboard RPCs.';
