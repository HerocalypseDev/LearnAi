-- Performance: indexes for the queries the app runs on every page, and quiz_active_ms() for the overview. Run once in the Supabase SQL Editor
-- (safe to run again). Nothing changes for the app if you don't run it; pages are just a little slower to query
-- as the tables grow. schema.sql already has all of this for a brand-new project.

-- A submission's files: the homework page, uploads, hand-in and marking all filter uploads by submission.
create index if not exists uploads_submission_idx on uploads (submission_id);

-- A student's own submissions: the dashboard reads them by student (the unique (homework_id, student_id) index
-- only helps when the homework is known).
create index if not exists submissions_student_idx on submissions (student_id);

-- The activity page's event filter and the overview's quiz-time totals read activity by event.
create index if not exists activity_log_event_time_idx on activity_log (event, created_at desc);

-- Quiz time per student and homework for the teacher's overview, added up here instead of sending every
-- answer_change row to the app. Only the server's key may call it (RLS would hide the rows from anyone else anyway).
create or replace function quiz_active_ms()
returns table (user_id uuid, homework_id text, active_ms bigint)
language sql stable
set search_path = public
as $$
  select l.user_id,
         l.detail->>'homework_id',
         coalesce(sum(case when jsonb_typeof(l.detail->'active_ms') = 'number' then (l.detail->>'active_ms')::numeric else 0 end), 0)::bigint
  from activity_log l
  where l.event = 'answer_change' and l.detail ? 'homework_id'
  group by l.user_id, l.detail->>'homework_id';
$$;
revoke all on function quiz_active_ms() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function quiz_active_ms() from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on function quiz_active_ms() from authenticated; end if;
end $$;
grant execute on function quiz_active_ms() to service_role;

-- Tell the Data API about the new function straight away.
notify pgrst, 'reload schema';
