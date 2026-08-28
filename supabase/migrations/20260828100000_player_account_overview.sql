-- Account-page completion graph and lifetime leaderboard best (PROFILE polish).
-- Both values are derived from server-owned daily_best rows.

create or replace function public.get_player_account_overview()
returns table (
  completion_days date[],
  best_rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with own_days as (
    select dc.starts_at::date as challenge_day
    from public.daily_best as db
    inner join public.daily_challenges as dc on dc.id = db.daily_challenge_id
    where db.user_id = auth.uid()
  ),
  fastest as (
    select
      db.user_id,
      row_number() over (
        partition by db.daily_challenge_id
        order by db.fastest_solve_ms asc, db.cost_at_fastest asc, db.user_id asc
      ) as rank
    from public.daily_best as db
  ),
  cheapest as (
    select
      db.user_id,
      row_number() over (
        partition by db.daily_challenge_id
        order by db.cheapest_cost asc, db.solve_time_at_cheapest asc, db.user_id asc
      ) as rank
    from public.daily_best as db
  )
  select
    coalesce((select array_agg(challenge_day order by challenge_day) from own_days), '{}'::date[]) as completion_days,
    nullif(
      least(
        coalesce((select min(rank) from fastest where user_id = auth.uid()), 9223372036854775807::bigint),
        coalesce((select min(rank) from cheapest where user_id = auth.uid()), 9223372036854775807::bigint)
      ),
      9223372036854775807::bigint
    ) as best_rank;
$$;

comment on function public.get_player_account_overview() is
  'Authenticated player completion dates and best-ever official leaderboard rank; no IDs or architectures returned.';

revoke all on function public.get_player_account_overview() from public;
grant execute on function public.get_player_account_overview() to authenticated, service_role;
