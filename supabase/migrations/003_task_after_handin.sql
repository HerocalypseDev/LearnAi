-- Task files stay editable after the quiz is handed in. Run once in the Supabase SQL Editor (safe to run again,
-- in any order with 002 and 004).
--
-- Before: no new file once the homework was handed in. Now: a file can be added until the teacher RELEASES the
-- result. It still serialises parallel uploads per submission and still allows at most 10 files (keep 10 in step
-- with MAX_FILES in src/lib/rules.ts). Installs the same, current trigger as 002 and 004.
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
