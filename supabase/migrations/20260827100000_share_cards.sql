-- Server-authored, passed-only share cards. The payload is deliberately
-- separate from submissions so public reads never need the architecture blob.
create table public.share_cards (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.share_cards is
  'Public-safe share payloads minted only by trusted server code from verified passing submissions.';
comment on column public.share_cards.payload is
  'Versioned ShareCardV1 data; never contains architecture_json or private attempt internals.';

alter table public.share_cards enable row level security;
-- No client policies: minting and reads go through server helpers using service_role.
