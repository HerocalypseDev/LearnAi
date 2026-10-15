-- Editing a written piece ("Write text" -> Edit) is locked by the release too. Run once in the Supabase SQL
-- Editor (safe to run again, in any order with 002 and 003).
--
-- Editing Writing-N.txt uploads the new text as a new file and moves the upload row to it (an UPDATE of
-- storage_path). Before this migration the trigger only checked INSERTs, so the app's own check was the only
-- thing stopping an edit that raced the teacher's release. Now the database refuses that too. New files still
-- count toward the 10-file limit; an edit doesn't add one. Same function and trigger as in 002 and 003.
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
