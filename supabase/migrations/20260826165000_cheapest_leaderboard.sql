-- Public cheapest leaderboard: ranked rows from daily_best + profiles.alias.
-- Independent of fastest ranking (different submission fields on the same projection).

create index if not exists daily_best_cheapest_rank_idx
  on public.daily_best (daily_challenge_id, cheapest_cost, solve_time_at_cheapest, user_id);

create or replace function public.list_cheapest_leaderboard(
  p_daily_challenge_id uuid,
  p_limit integer default 100
)
returns table (
  rank bigint,
  alias text,
  cheapest_cost numeric,
  solve_time_at_cheapest integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (
      order by db.cheapest_cost asc, db.solve_time_at_cheapest asc, db.user_id asc
    ) as rank,
    p.alias,
    db.cheapest_cost,
    db.solve_time_at_cheapest
  from public.daily_best as db
  inner join public.profiles as p on p.user_id = db.user_id
  where db.daily_challenge_id = p_daily_challenge_id
  order by db.cheapest_cost asc, db.solve_time_at_cheapest asc, db.user_id asc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

comment on function public.list_cheapest_leaderboard(uuid, integer) is
  'Public cheapest leaderboard for one daily challenge. Order: cheapest_cost, solve_time_at_cheapest, user_id (tie-break only; UUID not returned).';

revoke all on function public.list_cheapest_leaderboard(uuid, integer) from public;
grant execute on function public.list_cheapest_leaderboard(uuid, integer) to anon, authenticated, service_role;
