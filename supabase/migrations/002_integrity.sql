-- Upload integrity. Run once in the Supabase SQL Editor (safe to run again).
-- Without it the app still checks the limits, but two uploads confirmed at the very same moment
-- could slip past the 10-file limit, or land just after the child hands in.

-- One row per stored file (a double "confirm" can't list the same file twice).
create unique index if not exists uploads_storage_path_key on uploads (storage_path);

-- Serialises uploads per submission: locks the submission row, then refuses the new file if the
-- homework was handed in or already has 10 files. Keep 10 in step with MAX_FILES in src/lib/rules.ts.
create or replace function enforce_upload_rules() returns trigger
language plpgsql as $$
declare
  current_status text;
  file_count int;
begin
  select status into current_status from submissions where id = new.submission_id for update;
  if current_status is distinct from 'draft' then
    raise exception 'already_submitted';
  end if;
  select count(*) into file_count from uploads where submission_id = new.submission_id;
  if file_count >= 10 then
    raise exception 'upload_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists uploads_rules on uploads;
create trigger uploads_rules before insert on uploads
  for each row execute function enforce_upload_rules();
