-- Task files stay editable after the quiz is handed in. Run once in the Supabase SQL Editor (safe to run again).
--
-- Replaces the upload trigger from 002_integrity.sql. Before: no new file once the homework was handed in.
-- Now: a file can be added until the teacher RELEASES the result. It still serialises parallel uploads per
-- submission and still allows at most 10 files (keep 10 in step with MAX_FILES in src/lib/rules.ts).
create or replace function enforce_upload_rules() returns trigger
language plpgsql as $$
declare
  file_count int;
begin
  perform 1 from submissions where id = new.submission_id for update;
  if exists (select 1 from grades where submission_id = new.submission_id and released_at is not null) then
    raise exception 'task_locked';
  end if;
  select count(*) into file_count from uploads where submission_id = new.submission_id;
  if file_count >= 10 then
    raise exception 'upload_limit';
  end if;
  return new;
end;
$$;
