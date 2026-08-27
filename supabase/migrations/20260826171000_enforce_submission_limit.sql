-- Route-level counts are only a fast-path. Enforce the cap at the write boundary
-- while serializing all inserts for the same attempt, so concurrent requests
-- cannot exceed the official submission limit.

create or replace function public.enforce_submission_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_count integer;
begin
  perform 1
  from public.attempts
  where id = new.attempt_id
  for update;

  if not found then
    raise exception 'submissions.attempt_id does not reference an attempt';
  end if;

  select count(*)
    into v_submission_count
  from public.submissions
  where attempt_id = new.attempt_id;

  if v_submission_count >= 50 then
    raise exception 'official submission limit reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists submissions_enforce_limit on public.submissions;
create trigger submissions_enforce_limit
  before insert on public.submissions
  for each row
  execute function public.enforce_submission_limit();
