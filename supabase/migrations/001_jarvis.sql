-- Jarvis integration. Run once in the Supabase SQL Editor (safe to re-run).
-- The app keeps working without it, but then Jarvis's actions aren't logged,
-- "Marked by Jarvis" isn't recorded and marking notes can't be saved.

-- Who saved the marks: 'admin' (you, on the website) or 'jarvis'.
alter table grades add column if not exists marked_by text not null default 'admin';

-- Private notes Jarvis uses when marking (what a good answer / task looks like). Kids never see these.
alter table homeworks add column if not exists marking_notes text not null default '';

-- Allow 'admin_action' in the activity log, used for everything Jarvis changes.
alter table activity_log drop constraint if exists activity_log_event_check;
alter table activity_log add constraint activity_log_event_check check (event in (
  'login', 'login_failed', 'logout', 'page_view', 'quiz_start',
  'answer_change', 'upload', 'submit', 'view_feedback', 'admin_action'));
