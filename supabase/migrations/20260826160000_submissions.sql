-- Official verified submissions: append-only audit of server re-simulation results.
-- Verified metrics/cost/requirements are written only by trusted server paths (service role).

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  attempt_id uuid not null references public.attempts (id),
  daily_challenge_id uuid not null references public.daily_challenges (id),
  challenge_version_id uuid not null references public.challenge_versions (id),

  architecture_json jsonb not null,
  architecture_hash text not null,

  -- Denormalized challenge version number + simulator pin for audit without joins.
  challenge_version integer not null check (challenge_version >= 1),
  simulator_version text not null,

  verified_metrics jsonb not null,
  verified_cost jsonb not null,
  verified_requirements jsonb not null,

  all_requirements_pass boolean not null,
  within_budget boolean not null,

  -- Locked official solve duration (ms) when applicable; null for non-ranking / not-yet-valid rows.
  official_solve_ms integer check (official_solve_ms is null or official_solve_ms >= 0),

  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.submissions is
  'Append-only server-verified official submissions; client metrics are never trusted.';
comment on column public.submissions.architecture_hash is
  'Server-computed SHA-256 of canonicalized architecture_json; clients must not supply trusted hashes.';
comment on column public.submissions.verified_metrics is
  'Competition-relevant metrics from packages/simulator on the server.';
comment on column public.submissions.verified_cost is
  'CostResult from the shared cost engine on the server.';
comment on column public.submissions.verified_requirements is
  'RequirementResult[] from shared requirement evaluation on the server.';
comment on column public.submissions.official_solve_ms is
  'first_valid_at - started_at in ms when ranking-eligible; null otherwise.';

create index submissions_attempt_id_idx on public.submissions (attempt_id);
create index submissions_user_daily_idx on public.submissions (user_id, daily_challenge_id);
create index submissions_architecture_hash_idx on public.submissions (architecture_hash);
create index submissions_created_at_idx on public.submissions (created_at);

-- Keep submission identity aligned with the referenced attempt.
create or replace function public.enforce_submission_attempt_ownership()
returns trigger
language plpgsql
as $$
declare
  attempt_user uuid;
  attempt_daily uuid;
begin
  select user_id, daily_challenge_id
    into attempt_user, attempt_daily
  from public.attempts
  where id = new.attempt_id;

  if attempt_user is null then
    raise exception 'submissions.attempt_id does not reference an attempt';
  end if;

  if new.user_id is distinct from attempt_user then
    raise exception 'submissions.user_id must match attempts.user_id';
  end if;

  if new.daily_challenge_id is distinct from attempt_daily then
    raise exception 'submissions.daily_challenge_id must match attempts.daily_challenge_id';
  end if;

  return new;
end;
$$;

create trigger submissions_enforce_attempt_ownership
  before insert on public.submissions
  for each row
  execute function public.enforce_submission_attempt_ownership();

create or replace function public.prevent_submission_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'submissions rows are immutable';
end;
$$;

create trigger submissions_immutable_update
  before update on public.submissions
  for each row
  execute function public.prevent_submission_mutation();

create trigger submissions_immutable_delete
  before delete on public.submissions
  for each row
  execute function public.prevent_submission_mutation();

alter table public.submissions enable row level security;

-- Players may read their own submissions (history/audit UI). Writes are service-role only.
create policy "Players read own submissions"
  on public.submissions
  for select
  to authenticated
  using (auth.uid() = user_id);
