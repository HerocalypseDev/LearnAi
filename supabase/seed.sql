-- Creates the admin account and the two students.
-- Run this once, after schema.sql, in the Supabase SQL Editor.
--
-- Passwords are NOT set here. After the app is deployed:
--   * log in as "admin" with the ADMIN_PASSWORD you put in Vercel, then
--   * set each child's password on the admin page.
--
-- username = the child's name in lowercase (that is what they type to log in).

insert into users (full_name, username, age, role, version) values
  ('Admin',               'admin',      null, 'admin',   null),
  ('First Child Name',    'firstchild', 11,   'student', 'A'),
  ('Second Child Name',   'secondchild', 12,  'student', 'B')
on conflict (username) do nothing;
