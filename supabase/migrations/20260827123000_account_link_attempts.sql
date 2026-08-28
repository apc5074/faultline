-- Server-only audit trail for anonymous → permanent GitHub linking (AUTH-004).
-- Browsers never read or write this table; service role records outcomes.

create table public.account_link_attempts (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null references auth.users (id) on delete cascade,
  outcome text not null check (
    outcome in ('started', 'linked', 'conflict', 'failed', 'cancelled')
  ),
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.account_link_attempts is
  'Append-only link lifecycle audit for operator diagnostics; not competition truth.';

create index account_link_attempts_source_user_id_created_at_idx
  on public.account_link_attempts (source_user_id, created_at desc);

alter table public.account_link_attempts enable row level security;

-- No policies: authenticated/anon cannot access; service role bypasses RLS.
