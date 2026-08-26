-- Public fastest leaderboard: ranked rows from daily_best + profiles.alias.
-- SECURITY DEFINER so guests can read rankings without exposing user UUIDs via table RLS.

create index if not exists daily_best_fastest_rank_idx
  on public.daily_best (daily_challenge_id, fastest_solve_ms, cost_at_fastest, user_id);

create or replace function public.list_fastest_leaderboard(
  p_daily_challenge_id uuid,
  p_limit integer default 100
)
returns table (
  rank bigint,
  alias text,
  fastest_solve_ms integer,
  cost_at_fastest numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (
      order by db.fastest_solve_ms asc, db.cost_at_fastest asc, db.user_id asc
    ) as rank,
    p.alias,
    db.fastest_solve_ms,
    db.cost_at_fastest
  from public.daily_best as db
  inner join public.profiles as p on p.user_id = db.user_id
  where db.daily_challenge_id = p_daily_challenge_id
  order by db.fastest_solve_ms asc, db.cost_at_fastest asc, db.user_id asc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

comment on function public.list_fastest_leaderboard(uuid, integer) is
  'Public fastest leaderboard for one daily challenge. Order: solve_ms, cost_at_fastest, user_id (tie-break only; UUID not returned).';

revoke all on function public.list_fastest_leaderboard(uuid, integer) from public;
grant execute on function public.list_fastest_leaderboard(uuid, integer) to anon, authenticated, service_role;
