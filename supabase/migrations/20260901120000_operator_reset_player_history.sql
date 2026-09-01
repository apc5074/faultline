-- Narrow operator-only reset for local competition testing.
-- Removes all persisted official competition data for exactly one user.

create or replace function public.reset_player_daily_run(
  p_user_id uuid
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
  v_share_cards integer;
begin
  perform set_config('faultline.operator_reset', 'on', true);

  select count(*)::integer into v_attempts
  from public.attempts
  where user_id = p_user_id;

  select count(*)::integer into v_submissions
  from public.submissions
  where user_id = p_user_id;

  delete from public.share_cards
  where submission_id in (
    select id from public.submissions where user_id = p_user_id
  );
  get diagnostics v_share_cards = row_count;

  delete from public.daily_best
  where user_id = p_user_id;
  get diagnostics v_daily_best = row_count;

  delete from public.submissions
  where user_id = p_user_id;

  delete from public.attempts
  where user_id = p_user_id;

  return jsonb_build_object(
    'attempts', v_attempts,
    'submissions', v_submissions,
    'daily_best', v_daily_best,
    'share_cards', v_share_cards
  );
end;
$$;

revoke all on function public.reset_player_daily_run(uuid) from public;
revoke all on function public.reset_player_daily_run(uuid) from anon, authenticated;
grant execute on function public.reset_player_daily_run(uuid) to service_role;

-- Remove the obsolete two-argument overload so the old current-day behavior
-- cannot be invoked accidentally.
revoke all on function public.reset_player_daily_run(uuid, uuid) from public;
revoke all on function public.reset_player_daily_run(uuid, uuid) from anon, authenticated;
revoke all on function public.reset_player_daily_run(uuid, uuid) from service_role;
