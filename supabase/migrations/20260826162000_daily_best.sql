-- Per-user/per-day ranking projection + atomic commit of verified submissions.
-- Clients never write daily_best; only service_role may execute the commit RPC.

create table public.daily_best (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  daily_challenge_id uuid not null references public.daily_challenges (id),

  fastest_submission_id uuid not null references public.submissions (id),
  fastest_solve_ms integer not null check (fastest_solve_ms >= 0),
  cost_at_fastest numeric not null check (cost_at_fastest >= 0),

  cheapest_submission_id uuid not null references public.submissions (id),
  cheapest_cost numeric not null check (cheapest_cost >= 0),
  solve_time_at_cheapest integer not null check (solve_time_at_cheapest >= 0),

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint daily_best_user_daily_unique unique (user_id, daily_challenge_id)
);

comment on table public.daily_best is
  'Compact ranking projection: first valid locks fastest; later eligible may improve cheapest.';
comment on column public.daily_best.fastest_solve_ms is
  'Locked official solve time from first eligible submission; never replaced by later solves.';
comment on column public.daily_best.cheapest_cost is
  'Best (lowest) verified monthlyTotal among eligible submissions; ties prefer lower solve time.';

create index daily_best_daily_challenge_id_idx on public.daily_best (daily_challenge_id);
create index daily_best_fastest_solve_ms_idx on public.daily_best (daily_challenge_id, fastest_solve_ms);
create index daily_best_cheapest_cost_idx on public.daily_best (daily_challenge_id, cheapest_cost);

alter table public.daily_best enable row level security;

create policy "Players read own daily best"
  on public.daily_best
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policies for authenticated/anon — service role bypasses RLS.

/**
 * Atomically:
 *   1. lock attempt
 *   2. set attempts.first_valid_at once when eligible
 *   3. insert submissions row (official_solve_ms from server timestamps)
 *   4. upsert daily_best when eligible
 *
 * Ineligible rows (requirements/budget fail) are still stored; they do not touch daily_best.
 * SECURITY DEFINER + execute granted only to service_role so browsers cannot invent scores.
 */
create or replace function public.commit_verified_submission(
  p_user_id uuid,
  p_attempt_id uuid,
  p_daily_challenge_id uuid,
  p_challenge_version_id uuid,
  p_architecture_json jsonb,
  p_architecture_hash text,
  p_challenge_version integer,
  p_simulator_version text,
  p_verified_metrics jsonb,
  p_verified_cost jsonb,
  p_verified_requirements jsonb,
  p_all_requirements_pass boolean,
  p_within_budget boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts%rowtype;
  v_eligible boolean;
  v_now timestamptz;
  v_first_valid timestamptz;
  v_solve_ms integer;
  v_monthly_cost numeric;
  v_submission public.submissions%rowtype;
  v_best public.daily_best%rowtype;
begin
  select *
    into v_attempt
  from public.attempts
  where id = p_attempt_id
  for update;

  if not found then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;

  if v_attempt.user_id is distinct from p_user_id then
    raise exception 'attempt does not belong to user' using errcode = '42501';
  end if;

  if v_attempt.daily_challenge_id is distinct from p_daily_challenge_id then
    raise exception 'attempt daily challenge mismatch' using errcode = '22023';
  end if;

  v_monthly_cost := (p_verified_cost ->> 'monthlyTotal')::numeric;
  if v_monthly_cost is null or v_monthly_cost < 0 then
    raise exception 'verified_cost.monthlyTotal must be a non-negative number' using errcode = '22023';
  end if;

  v_eligible := p_all_requirements_pass and p_within_budget;
  v_now := timezone('utc', now());

  if v_eligible then
    if v_attempt.first_valid_at is null then
      update public.attempts
         set first_valid_at = v_now
       where id = p_attempt_id
       returning first_valid_at into v_first_valid;
    else
      v_first_valid := v_attempt.first_valid_at;
    end if;

    v_solve_ms := greatest(
      0,
      floor(extract(epoch from (v_first_valid - v_attempt.started_at)) * 1000)::integer
    );
  else
    v_first_valid := v_attempt.first_valid_at;
    v_solve_ms := null;
  end if;

  insert into public.submissions (
    user_id,
    attempt_id,
    daily_challenge_id,
    challenge_version_id,
    architecture_json,
    architecture_hash,
    challenge_version,
    simulator_version,
    verified_metrics,
    verified_cost,
    verified_requirements,
    all_requirements_pass,
    within_budget,
    official_solve_ms
  )
  values (
    p_user_id,
    p_attempt_id,
    p_daily_challenge_id,
    p_challenge_version_id,
    p_architecture_json,
    p_architecture_hash,
    p_challenge_version,
    p_simulator_version,
    p_verified_metrics,
    p_verified_cost,
    p_verified_requirements,
    p_all_requirements_pass,
    p_within_budget,
    v_solve_ms
  )
  returning * into v_submission;

  if v_eligible then
    insert into public.daily_best (
      user_id,
      daily_challenge_id,
      fastest_submission_id,
      fastest_solve_ms,
      cost_at_fastest,
      cheapest_submission_id,
      cheapest_cost,
      solve_time_at_cheapest
    )
    values (
      p_user_id,
      p_daily_challenge_id,
      v_submission.id,
      v_solve_ms,
      v_monthly_cost,
      v_submission.id,
      v_monthly_cost,
      v_solve_ms
    )
    on conflict (user_id, daily_challenge_id) do update
      set
        -- fastest* stay locked from the first eligible row
        cheapest_submission_id = case
          when excluded.cheapest_cost < daily_best.cheapest_cost
            or (
              excluded.cheapest_cost = daily_best.cheapest_cost
              and excluded.solve_time_at_cheapest < daily_best.solve_time_at_cheapest
            )
          then excluded.cheapest_submission_id
          else daily_best.cheapest_submission_id
        end,
        cheapest_cost = case
          when excluded.cheapest_cost < daily_best.cheapest_cost
            or (
              excluded.cheapest_cost = daily_best.cheapest_cost
              and excluded.solve_time_at_cheapest < daily_best.solve_time_at_cheapest
            )
          then excluded.cheapest_cost
          else daily_best.cheapest_cost
        end,
        solve_time_at_cheapest = case
          when excluded.cheapest_cost < daily_best.cheapest_cost
            or (
              excluded.cheapest_cost = daily_best.cheapest_cost
              and excluded.solve_time_at_cheapest < daily_best.solve_time_at_cheapest
            )
          then excluded.solve_time_at_cheapest
          else daily_best.solve_time_at_cheapest
        end,
        updated_at = timezone('utc', now())
    returning * into v_best;
  end if;

  return jsonb_build_object(
    'submission', jsonb_build_object(
      'id', v_submission.id,
      'user_id', v_submission.user_id,
      'attempt_id', v_submission.attempt_id,
      'daily_challenge_id', v_submission.daily_challenge_id,
      'challenge_version_id', v_submission.challenge_version_id,
      'architecture_hash', v_submission.architecture_hash,
      'challenge_version', v_submission.challenge_version,
      'simulator_version', v_submission.simulator_version,
      'all_requirements_pass', v_submission.all_requirements_pass,
      'within_budget', v_submission.within_budget,
      'official_solve_ms', v_submission.official_solve_ms,
      'created_at', v_submission.created_at
    ),
    'eligible', v_eligible,
    'first_valid_at', v_first_valid,
    'daily_best', case
      when v_best.id is null then null
      else jsonb_build_object(
        'id', v_best.id,
        'user_id', v_best.user_id,
        'daily_challenge_id', v_best.daily_challenge_id,
        'fastest_submission_id', v_best.fastest_submission_id,
        'fastest_solve_ms', v_best.fastest_solve_ms,
        'cost_at_fastest', v_best.cost_at_fastest,
        'cheapest_submission_id', v_best.cheapest_submission_id,
        'cheapest_cost', v_best.cheapest_cost,
        'solve_time_at_cheapest', v_best.solve_time_at_cheapest,
        'created_at', v_best.created_at,
        'updated_at', v_best.updated_at
      )
    end
  );
end;
$$;

revoke all on function public.commit_verified_submission(
  uuid, uuid, uuid, uuid, jsonb, text, integer, text, jsonb, jsonb, jsonb, boolean, boolean
) from public;

revoke all on function public.commit_verified_submission(
  uuid, uuid, uuid, uuid, jsonb, text, integer, text, jsonb, jsonb, jsonb, boolean, boolean
) from anon, authenticated;

grant execute on function public.commit_verified_submission(
  uuid, uuid, uuid, uuid, jsonb, text, integer, text, jsonb, jsonb, jsonb, boolean, boolean
) to service_role;
