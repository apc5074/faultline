-- Current player's fastest + cheapest ranks for one daily challenge.
-- Same ordering as list_fastest_leaderboard / list_cheapest_leaderboard.
-- Uses auth.uid(); returns no row when unauthenticated or unranked.

create or replace function public.get_my_leaderboard_ranks(
  p_daily_challenge_id uuid
)
returns table (
  alias text,
  fastest_rank bigint,
  cheapest_rank bigint,
  fastest_solve_ms integer,
  cost_at_fastest numeric,
  cheapest_cost numeric,
  solve_time_at_cheapest integer
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      db.user_id,
      db.fastest_solve_ms,
      db.cost_at_fastest,
      db.cheapest_cost,
      db.solve_time_at_cheapest,
      row_number() over (
        order by db.fastest_solve_ms asc, db.cost_at_fastest asc, db.user_id asc
      ) as fastest_rank,
      row_number() over (
        order by db.cheapest_cost asc, db.solve_time_at_cheapest asc, db.user_id asc
      ) as cheapest_rank
    from public.daily_best as db
    where db.daily_challenge_id = p_daily_challenge_id
  )
  select
    p.alias,
    r.fastest_rank,
    r.cheapest_rank,
    r.fastest_solve_ms,
    r.cost_at_fastest,
    r.cheapest_cost,
    r.solve_time_at_cheapest
  from ranked as r
  inner join public.profiles as p on p.user_id = r.user_id
  where auth.uid() is not null
    and r.user_id = auth.uid();
$$;

comment on function public.get_my_leaderboard_ranks(uuid) is
  'Authenticated player ranks for one daily challenge. Empty when unranked; UUID never returned.';

revoke all on function public.get_my_leaderboard_ranks(uuid) from public;
grant execute on function public.get_my_leaderboard_ranks(uuid) to authenticated, service_role;
