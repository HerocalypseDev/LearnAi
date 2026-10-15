-- Performance: indexes for the queries the app runs on every page. Run once in the Supabase SQL Editor
-- (safe to run again). Nothing changes for the app if you don't run it; pages are just a little slower to query
-- as the tables grow. schema.sql already has all of this for a brand-new project.

-- A submission's files: the homework page, uploads, hand-in and marking all filter uploads by submission.
create index if not exists uploads_submission_idx on uploads (submission_id);

-- A student's own submissions: the dashboard reads them by student (the unique (homework_id, student_id) index
-- only helps when the homework is known).
create index if not exists submissions_student_idx on submissions (student_id);

-- The activity page's event filter and the overview's quiz-time totals read activity by event.
create index if not exists activity_log_event_time_idx on activity_log (event, created_at desc);
