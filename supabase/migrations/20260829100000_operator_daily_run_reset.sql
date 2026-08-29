-- Narrow operator-only reset for local competition testing.
-- The normal submissions table is append-only; this RPC is the only supported
-- maintenance path for removing one player's current-day test run.

create or replace function public.prevent_submission_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('faultline.operator_reset', true) = 'on' then
    return old;
  end if;
  raise exception 'submissions rows are immutable';
end;
$$;

create or replace function public.reset_player_daily_run(
  p_user_id uuid,
  p_daily_challenge_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_submissions integer;
  v_daily_best integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'operator reset requires service_role';
  end if;

  -- The setting is transaction-local and is only enabled inside this
  -- service-role function, allowing the append-only trigger to remain intact
  -- for every normal application path.
  perform set_config('faultline.operator_reset', 'on', true);

  select count(*)::integer into v_attempts
  from public.attempts
  where user_id = p_user_id
    and daily_challenge_id = p_daily_challenge_id;

  select count(*)::integer into v_submissions
  from public.submissions
  where user_id = p_user_id
    and daily_challenge_id = p_daily_challenge_id;

  delete from public.share_cards
  where submission_id in (
    select id from public.submissions
    where user_id = p_user_id
      and daily_challenge_id = p_daily_challenge_id
  );

  delete from public.daily_best
  where user_id = p_user_id
    and daily_challenge_id = p_daily_challenge_id;
  get diagnostics v_daily_best = row_count;

  delete from public.submissions
  where user_id = p_user_id
    and daily_challenge_id = p_daily_challenge_id;

  delete from public.attempts
  where user_id = p_user_id
    and daily_challenge_id = p_daily_challenge_id;

  return jsonb_build_object(
    'attempts', v_attempts,
    'submissions', v_submissions,
    'daily_best', v_daily_best
  );
end;
$$;

revoke all on function public.reset_player_daily_run(uuid, uuid) from public;
revoke all on function public.reset_player_daily_run(uuid, uuid) from anon, authenticated;
grant execute on function public.reset_player_daily_run(uuid, uuid) to service_role;

