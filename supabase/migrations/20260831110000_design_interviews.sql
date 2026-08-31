-- Durable external-agent design interview state and append-only event history.
-- The interview stores architecture identity and bounded state, never the
-- canonical architecture or official competition results.

create table public.design_interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  architecture_revision text not null,
  challenge_id text,
  state_json jsonb not null,
  status text not null check (status in ('awaiting_answer', 'awaiting_follow_up_or_next', 'completed', 'stale', 'abandoned')),
  current_question_id text,
  question_ordinal integer not null check (question_ordinal >= 1),
  total_questions integer not null check (total_questions between 1 and 100),
  started_at timestamptz not null,
  completed_at timestamptz,
  stale_at timestamptz,
  state_revision bigint not null default 0 check (state_revision >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint design_interviews_architecture_revision_not_blank check (length(trim(architecture_revision)) > 0),
  constraint design_interviews_state_size check (octet_length(state_json::text) <= 500000),
  constraint design_interviews_completion_consistency check (
    (status = 'completed') = (completed_at is not null)
  ),
  constraint design_interviews_stale_consistency check (
    (status = 'stale') = (stale_at is not null)
  )
);

comment on table public.design_interviews is
  'Server-owned sequential design interview state; not architecture or official competition truth.';
comment on column public.design_interviews.architecture_revision is
  'Evidence revision captured when the interview agenda was created.';
comment on column public.design_interviews.state_json is
  'Bounded serialized InterviewState projection used to resume the interview.';
comment on column public.design_interviews.state_revision is
  'Optimistic-concurrency revision incremented for every committed transition.';

create index design_interviews_user_updated_idx
  on public.design_interviews (user_id, updated_at desc);
create index design_interviews_user_active_idx
  on public.design_interviews (user_id, updated_at desc)
  where status in ('awaiting_answer', 'awaiting_follow_up_or_next');

create table public.design_interview_events (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.design_interviews (id) on delete cascade,
  event_id text not null,
  event_type text not null check (event_type in ('start', 'answer', 'follow_up', 'advance', 'stale', 'abandon')),
  question_id text,
  actor text not null check (actor in ('user', 'agent', 'system')),
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint design_interview_events_event_id_not_blank check (length(trim(event_id)) > 0),
  constraint design_interview_events_payload_size check (octet_length(payload::text) <= 100000),
  constraint design_interview_events_unique_event unique (interview_id, event_id)
);

comment on table public.design_interview_events is
  'Append-only transition audit for design interviews; answer text is bounded and not logged by default.';

create index design_interview_events_interview_created_idx
  on public.design_interview_events (interview_id, created_at asc);

alter table public.design_interviews enable row level security;
alter table public.design_interview_events enable row level security;

-- Reads are owner-scoped. Server routes use a service-role repository for
-- writes and still pass the authenticated owner id explicitly.
create policy "Players read own design interviews"
  on public.design_interviews
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Players read own design interview events"
  on public.design_interview_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.design_interviews as interview
      where interview.id = design_interview_events.interview_id
        and interview.user_id = auth.uid()
    )
  );

-- All state and event mutations go through this transaction boundary. The
-- expected revision makes retries safe and prevents lost transitions.
create or replace function public.commit_design_interview_transition(
  p_interview_id uuid,
  p_user_id uuid,
  p_expected_revision bigint,
  p_event_id text,
  p_event_type text,
  p_question_id text,
  p_actor text,
  p_payload jsonb,
  p_state_json jsonb,
  p_status text,
  p_current_question_id text,
  p_question_ordinal integer,
  p_total_questions integer,
  p_completed_at timestamptz default null,
  p_stale_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
begin
  if p_user_id is null or p_interview_id is null or p_event_id is null then
    raise exception 'design interview identity is required';
  end if;

  select state_revision
    into v_revision
    from public.design_interviews
   where id = p_interview_id
     and user_id = p_user_id
   for update;

  if not found then
    raise exception 'design interview not found';
  end if;

  if exists (
    select 1
      from public.design_interview_events
     where interview_id = p_interview_id
       and event_id = p_event_id
  ) then
    return v_revision;
  end if;

  if v_revision <> p_expected_revision then
    raise exception 'design interview revision conflict';
  end if;

  insert into public.design_interview_events (
    interview_id, event_id, event_type, question_id, actor, payload
  ) values (
    p_interview_id, p_event_id, p_event_type, p_question_id, p_actor, p_payload
  );

  update public.design_interviews
     set state_json = p_state_json,
         status = p_status,
         current_question_id = p_current_question_id,
         question_ordinal = p_question_ordinal,
         total_questions = p_total_questions,
         completed_at = p_completed_at,
         stale_at = p_stale_at,
         state_revision = v_revision + 1,
         updated_at = timezone('utc', now())
   where id = p_interview_id
     and user_id = p_user_id;

  return v_revision + 1;
end;
$$;

revoke all on function public.commit_design_interview_transition(
  uuid, uuid, bigint, text, text, text, text, jsonb, jsonb, text, text,
  integer, integer, timestamptz, timestamptz
) from public;
grant execute on function public.commit_design_interview_transition(
  uuid, uuid, bigint, text, text, text, text, jsonb, jsonb, text, text,
  integer, integer, timestamptz, timestamptz
) to service_role;
