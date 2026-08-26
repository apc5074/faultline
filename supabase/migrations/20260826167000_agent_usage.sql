-- Opaque guest/day aggregate only. No prompt text, IP, email, or hidden reasoning is stored.
create table public.agent_usage_daily (
  usage_key uuid not null,
  usage_date date not null,
  requests integer not null default 0 check (requests >= 0),
  completed_requests integer not null default 0 check (completed_requests >= 0),
  latency_ms bigint not null default 0 check (latency_ms >= 0),
  tool_calls integer not null default 0 check (tool_calls >= 0),
  tool_steps integer not null default 0 check (tool_steps >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  errors integer not null default 0 check (errors >= 0),
  cancelled integer not null default 0 check (cancelled >= 0),
  last_model text,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (usage_key, usage_date)
);
alter table public.agent_usage_daily enable row level security;

create or replace function public.reserve_agent_usage(p_usage_key uuid, p_daily_limit integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_date date := timezone('utc', now())::date; v_requests integer;
begin
  if p_daily_limit < 1 then raise exception 'daily limit must be positive' using errcode = '22023'; end if;
  insert into public.agent_usage_daily (usage_key, usage_date, requests) values (p_usage_key, v_date, 1)
  on conflict (usage_key, usage_date) do update set requests = public.agent_usage_daily.requests + 1, updated_at = timezone('utc', now())
    where public.agent_usage_daily.requests < p_daily_limit
  returning requests into v_requests;
  return jsonb_build_object('reserved', found, 'usage_date', v_date);
end; $$;

create or replace function public.complete_agent_usage(p_usage_key uuid, p_usage_date date, p_model text, p_latency_ms integer, p_tool_calls integer, p_tool_steps integer, p_input_tokens bigint, p_output_tokens bigint, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_outcome not in ('completed', 'error', 'cancelled') then raise exception 'invalid outcome' using errcode = '22023'; end if;
  update public.agent_usage_daily set
    requests = greatest(0, requests + case when p_outcome = 'completed' then 0 else -1 end),
    completed_requests = completed_requests + case when p_outcome = 'completed' then 1 else 0 end,
    latency_ms = latency_ms + greatest(0, p_latency_ms),
    tool_calls = tool_calls + greatest(0, p_tool_calls), tool_steps = tool_steps + greatest(0, p_tool_steps),
    input_tokens = input_tokens + greatest(0, p_input_tokens), output_tokens = output_tokens + greatest(0, p_output_tokens),
    errors = errors + case when p_outcome = 'error' then 1 else 0 end,
    cancelled = cancelled + case when p_outcome = 'cancelled' then 1 else 0 end,
    last_model = p_model, updated_at = timezone('utc', now())
  where usage_key = p_usage_key and usage_date = p_usage_date;
end; $$;

revoke all on function public.reserve_agent_usage(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_agent_usage(uuid, date, text, integer, integer, integer, bigint, bigint, text) from public, anon, authenticated;
