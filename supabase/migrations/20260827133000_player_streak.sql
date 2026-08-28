-- Recomputed verified daily streak from daily_best + challenge schedule (STREAK-001).

create or replace function public.get_player_streak()
returns table (
  current_streak integer,
  longest_streak integer,
  today_completed boolean,
  last_completed_starts_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_user_id uuid := auth.uid();
  v_current integer := 0;
  v_longest integer := 0;
  v_run integer := 0;
  v_today_completed boolean := false;
  v_last_completed timestamptz := null;
  r record;
begin
  if v_user_id is null then
    return query select 0, 0, false, null::timestamptz;
    return;
  end if;

  for r in
    select
      dc.starts_at,
      dc.ends_at,
      (db.id is not null) as completed
    from public.daily_challenges as dc
    left join public.daily_best as db
      on db.daily_challenge_id = dc.id
     and db.user_id = v_user_id
    where dc.starts_at <= v_now
    order by dc.starts_at asc
  loop
    if r.completed then
      v_run := v_run + 1;
      if v_run > v_longest then
        v_longest := v_run;
      end if;
      v_last_completed := r.starts_at;
    else
      v_run := 0;
    end if;

    if r.starts_at <= v_now and r.ends_at > v_now then
      v_today_completed := r.completed;
    end if;
  end loop;

  for r in
    select
      dc.starts_at,
      dc.ends_at,
      (db.id is not null) as completed
    from public.daily_challenges as dc
    left join public.daily_best as db
      on db.daily_challenge_id = dc.id
     and db.user_id = v_user_id
    where dc.starts_at <= v_now
    order by dc.starts_at desc
  loop
    if r.ends_at > v_now and not r.completed then
      continue;
    end if;

    if r.completed then
      v_current := v_current + 1;
    else
      exit;
    end if;
  end loop;

  return query select v_current, v_longest, v_today_completed, v_last_completed;
end;
$$;

comment on function public.get_player_streak() is
  'Authenticated player streak from eligible daily_best rows; UTC challenge-day schedule.';

revoke all on function public.get_player_streak() from public;
grant execute on function public.get_player_streak() to authenticated, service_role;
