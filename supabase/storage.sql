-- Creates the private storage bucket for homework uploads.
-- Run this once in the Supabase SQL Editor (safe to re-run).
--
-- Private: files are only reachable through short-lived links the app creates.
-- The 20MB limit is enforced by Supabase itself as well as by the app.

insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 20971520)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;
