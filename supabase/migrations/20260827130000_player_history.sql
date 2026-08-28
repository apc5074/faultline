-- Shaped player history over verified submissions + daily_best (PROFILE-001).
-- SECURITY DEFINER joins historical challenge metadata players cannot read via RLS.

create or replace function public.count_player_history()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct s.daily_challenge_id)
  from public.submissions as s
  where auth.uid() is not null
    and s.user_id = auth.uid();
$$;

comment on function public.count_player_history() is
  'Distinct challenge-day count for the authenticated player history pager.';

create or replace function public.list_player_history(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  challenge_starts_at timestamptz,
  challenge_slug text,
  challenge_version integer,
  challenge_title text,
  verified boolean,
  solve_ms integer,
  monthly_cost_usd numeric,
  requirements_passed integer,
  requirements_total integer,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select auth.uid() as user_id
  ),
  bounds as (
    select
      greatest(1, least(coalesce(p_limit, 20), 50)) as lim,
      greatest(coalesce(p_offset, 0), 0) as off
  ),
  user_days as (
    select
      s.daily_challenge_id,
      dc.starts_at,
      dc.challenge_version_id
    from public.submissions as s
    inner join public.daily_challenges as dc on dc.id = s.daily_challenge_id
    where s.user_id = (select user_id from caller)
    group by s.daily_challenge_id, dc.starts_at, dc.challenge_version_id
  ),
  paged_days as (
    select *
    from user_days
    order by starts_at desc
    offset (select off from bounds)
    limit (select lim from bounds)
  ),
  best_submission as (
    select distinct on (s.daily_challenge_id)
      s.daily_challenge_id,
      s.created_at,
      s.all_requirements_pass,
      s.within_budget,
      s.official_solve_ms,
      s.verified_cost,
      s.verified_requirements
    from public.submissions as s
    where s.user_id = (select user_id from caller)
    order by
      s.daily_challenge_id,
      (s.all_requirements_pass and s.within_budget) desc,
      s.official_solve_ms asc nulls last,
      s.created_at desc
  )
  select
    pd.starts_at as challenge_starts_at,
    cv.slug as challenge_slug,
    cv.version as challenge_version,
    coalesce(cv.config_json -> 'identity' ->> 'title', cv.slug) as challenge_title,
    (db.id is not null) as verified,
    case when db.id is not null then db.fastest_solve_ms else null end as solve_ms,
    coalesce(
      db.cost_at_fastest,
      nullif((bs.verified_cost ->> 'monthlyTotal')::numeric, null)
    ) as monthly_cost_usd,
    coalesce(
      (
        select count(*)::integer
        from jsonb_array_elements(bs.verified_requirements) as req
        where coalesce((req ->> 'passed')::boolean, false)
      ),
      0
    ) as requirements_passed,
    coalesce(jsonb_array_length(bs.verified_requirements), 0)::integer as requirements_total,
    bs.created_at as submitted_at
  from paged_days as pd
  inner join public.challenge_versions as cv on cv.id = pd.challenge_version_id
  inner join best_submission as bs on bs.daily_challenge_id = pd.daily_challenge_id
  left join public.daily_best as db
    on db.user_id = (select user_id from caller)
   and db.daily_challenge_id = pd.daily_challenge_id
  where (select user_id from caller) is not null
  order by pd.starts_at desc;
$$;

comment on function public.list_player_history(integer, integer) is
  'Authenticated player history, newest challenge day first. Never returns architecture JSON or UUIDs.';

revoke all on function public.count_player_history() from public;
grant execute on function public.count_player_history() to authenticated, service_role;

revoke all on function public.list_player_history(integer, integer) from public;
grant execute on function public.list_player_history(integer, integer) to authenticated, service_role;
