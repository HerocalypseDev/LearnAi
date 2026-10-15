-- Upload integrity. Run once in the Supabase SQL Editor (safe to run again, in any order with 003 and 004).
-- Without it the app still checks the limits, but two uploads confirmed at the very same moment
-- could slip past the 10-file limit, or land just after the result is released.

-- One row per stored file (a double "confirm" can't list the same file twice).
create unique index if not exists uploads_storage_path_key on uploads (storage_path);

-- The upload rules trigger, in its CURRENT form (originally this file refused files after hand-in; 003 changed
-- that to "until the result is released" and 004 added edits of written pieces). Every migration that touches it
-- installs the same final version, so re-running an older file can never bring back an older rule.
-- Keep 10 in step with MAX_FILES in src/lib/rules.ts.
create or replace function enforce_upload_rules() returns trigger
language plpgsql as $$
declare
  file_count int;
begin
  perform 1 from submissions where id = new.submission_id for update;
  if exists (select 1 from grades where submission_id = new.submission_id and released_at is not null) then
    raise exception 'task_locked';
  end if;
  -- Editing a written piece moves its row to a new file (an UPDATE): that adds no file, so only new rows count.
  if tg_op = 'INSERT' then
    select count(*) into file_count from uploads where submission_id = new.submission_id;
    if file_count >= 10 then
      raise exception 'upload_limit';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists uploads_rules on uploads;
create trigger uploads_rules before insert or update of storage_path on uploads
  for each row execute function enforce_upload_rules();
