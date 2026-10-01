-- Jarvis integration delta.
--
-- WHO NEEDS THIS: databases created from schema.sql BEFORE the Jarvis integration
-- (2 Oct 2026). A fresh project that ran the current schema.sql already has all of
-- this, and running it again is a safe no-op.
--
-- Run in the Supabase SQL Editor. Safe to re-run. The app keeps working without
-- it, but then Jarvis's actions aren't logged, "Marked by Jarvis" isn't recorded
-- and marking notes can't be saved.

-- Who saved the marks: 'admin' (you, on the website) or 'jarvis'.
alter table grades add column if not exists marked_by text not null default 'admin';
alter table grades drop constraint if exists grades_marked_by_check;
alter table grades add constraint grades_marked_by_check check (marked_by in ('admin', 'jarvis'));

-- Private notes Jarvis uses when marking (what a good answer / task looks like). Kids never see these.
alter table homeworks add column if not exists marking_notes text not null default '';

-- Allow 'admin_action' in the activity log, used for everything Jarvis changes.
alter table activity_log drop constraint if exists activity_log_event_check;
alter table activity_log add constraint activity_log_event_check check (event in (
  'login', 'login_failed', 'logout', 'page_view', 'quiz_start',
  'answer_change', 'upload', 'submit', 'view_feedback', 'admin_action'));
