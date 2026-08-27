-- Count reservations even when a client disconnects: the provider request may
-- already have incurred cost. Pair the mutable guest cookie with a keyed,
-- opaque network identifier supplied only by the server.

create or replace function public.reserve_agent_usage_pair(
  p_guest_key uuid,
  p_network_key uuid,
  p_guest_daily_limit integer,
  p_network_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := timezone('utc', now())::date;
  v_row record;
  v_guest_requests integer;
  v_network_requests integer;
begin
  if p_guest_key = p_network_key then
    raise exception 'guest and network usage keys must differ' using errcode = '22023';
  end if;
  if p_guest_daily_limit < 1 or p_network_daily_limit < 1 then
    raise exception 'daily limits must be positive' using errcode = '22023';
  end if;

  insert into public.agent_usage_daily (usage_key, usage_date)
  values (p_guest_key, v_date), (p_network_key, v_date)
  on conflict (usage_key, usage_date) do nothing;

  -- Lock both rows in one deterministic order before inspecting either limit.
  for v_row in
    select usage_key, requests
    from public.agent_usage_daily
    where usage_date = v_date
      and usage_key in (p_guest_key, p_network_key)
    order by usage_key
    for update
  loop
    if v_row.usage_key = p_guest_key then v_guest_requests := v_row.requests; end if;
    if v_row.usage_key = p_network_key then v_network_requests := v_row.requests; end if;
  end loop;

  if v_guest_requests is null or v_network_requests is null then
    raise exception 'usage rows were not available' using errcode = 'P0001';
  end if;
  if v_guest_requests >= p_guest_daily_limit or v_network_requests >= p_network_daily_limit then
    return jsonb_build_object('reserved', false, 'usage_date', v_date);
  end if;

  update public.agent_usage_daily
     set requests = requests + 1,
         updated_at = timezone('utc', now())
   where usage_date = v_date
     and usage_key in (p_guest_key, p_network_key);

  return jsonb_build_object('reserved', true, 'usage_date', v_date);
end;
$$;

create or replace function public.complete_agent_usage(p_usage_key uuid, p_usage_date date, p_model text, p_latency_ms integer, p_tool_calls integer, p_tool_steps integer, p_input_tokens bigint, p_output_tokens bigint, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_outcome not in ('completed', 'error', 'cancelled') then raise exception 'invalid outcome' using errcode = '22023'; end if;
  update public.agent_usage_daily set
    completed_requests = completed_requests + case when p_outcome = 'completed' then 1 else 0 end,
    latency_ms = latency_ms + greatest(0, p_latency_ms),
    tool_calls = tool_calls + greatest(0, p_tool_calls), tool_steps = tool_steps + greatest(0, p_tool_steps),
    input_tokens = input_tokens + greatest(0, p_input_tokens), output_tokens = output_tokens + greatest(0, p_output_tokens),
    errors = errors + case when p_outcome = 'error' then 1 else 0 end,
    cancelled = cancelled + case when p_outcome = 'cancelled' then 1 else 0 end,
    last_model = p_model, updated_at = timezone('utc', now())
  where usage_key = p_usage_key and usage_date = p_usage_date;
end;
$$;

revoke all on function public.reserve_agent_usage_pair(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_agent_usage_pair(uuid, uuid, integer, integer) to service_role;
