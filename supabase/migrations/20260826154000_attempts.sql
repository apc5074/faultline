-- Official competition attempts: one per user per daily challenge.
-- started_at is database-authored; clients never supply it.

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  daily_challenge_id uuid not null references public.daily_challenges (id),
  started_at timestamptz not null default timezone('utc', now()),
  first_valid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint attempts_user_daily_unique unique (user_id, daily_challenge_id),
  constraint attempts_first_valid_after_start check (
    first_valid_at is null or first_valid_at >= started_at
  )
);

comment on table public.attempts is
  'Server-authoritative official attempt start; one row per user per daily challenge.';
comment on column public.attempts.started_at is
  'Database/server time when the official attempt began; immutable.';
comment on column public.attempts.first_valid_at is
  'Set once on first eligible verified pass; null until then.';

create index attempts_daily_challenge_id_idx on public.attempts (daily_challenge_id);
create index attempts_user_id_idx on public.attempts (user_id);

create or replace function public.prevent_attempt_identity_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.daily_challenge_id is distinct from old.daily_challenge_id
    or new.started_at is distinct from old.started_at
  then
    raise exception 'attempts user_id, daily_challenge_id, and started_at are immutable';
  end if;
  -- first_valid_at may be set once from null → timestamp; never cleared or moved earlier.
  if old.first_valid_at is not null
    and new.first_valid_at is distinct from old.first_valid_at
  then
    raise exception 'attempts.first_valid_at is immutable once set';
  end if;
  return new;
end;
$$;

create trigger attempts_protect_identity
  before update on public.attempts
  for each row
  execute function public.prevent_attempt_identity_mutation();

alter table public.attempts enable row level security;

-- Players may read their own attempts (refresh/restore). Writes go through server routes (service role).
create policy "Players read own attempts"
  on public.attempts
  for select
  to authenticated
  using (auth.uid() = user_id);
