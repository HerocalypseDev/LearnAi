-- Editing a written piece ("Write text" -> Edit) is locked by the release too. Run once in the Supabase SQL
-- Editor (safe to run again, in any order with 002 and 003).
--
-- Editing Writing-N.txt uploads the new text as a new file and moves the upload row to it (an UPDATE of
-- storage_path). Before this migration the trigger only checked INSERTs, so the app's own check was the only
-- thing stopping an edit that raced the teacher's release. Now the database refuses that too. New files still
-- count toward the 10-file limit; an edit doesn't add one. Same function and trigger as in 002 and 003.
--
-- It also locks a handed-in quiz in the database (answers trigger below), as schema.sql does.
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

-- A handed-in quiz is final: no answer may change once its submission is 'submitted' (the app checks first; this
-- closes the gap when an autosave from a second tab lands just after hand-in). Marking still works: it only
-- writes manual_points / auto_points, and adds empty rows for unanswered questions.
create or replace function enforce_answer_lock() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- An upsert runs this INSERT check first even when the row exists; the UPDATE check below then decides.
    if (new.answer_text is not null or new.selected_option is not null)
       and not exists (select 1 from answers where submission_id = new.submission_id and question_id = new.question_id)
       and exists (select 1 from submissions where id = new.submission_id and status = 'submitted') then
      raise exception 'already_submitted';
    end if;
  elsif (new.answer_text is distinct from old.answer_text or new.selected_option is distinct from old.selected_option)
     and exists (select 1 from submissions where id = new.submission_id and status = 'submitted') then
    raise exception 'already_submitted';
  end if;
  return new;
end;
$$;

drop trigger if exists answers_lock on answers;
create trigger answers_lock before insert or update on answers
  for each row execute function enforce_answer_lock();
