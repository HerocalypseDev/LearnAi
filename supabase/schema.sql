-- Homework app database schema.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to re-run: every statement uses "if not exists".
--
-- Security model: Row Level Security is switched ON for every table and no
-- policies are added. That means the public "anon" key can read nothing; only
-- the app's server (using the secret / service_role key) can touch the data.

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  username      text not null unique check (username = lower(username)),
  age           int,
  password_hash text,
  role          text not null check (role in ('admin', 'student')),
  version       text check (version in ('A', 'B')),
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  check (role = 'admin' or version is not null)
);

create table if not exists homeworks (
  id             uuid primary key default gen_random_uuid(),
  week           int not null check (week between 1 and 4),
  title          text not null,
  due_at         timestamptz not null,
  instructions_a text not null default '',
  instructions_b text not null default '',
  max_points     int not null default 100,
  quiz_points    int not null default 40,
  task_points    int not null default 60,
  created_at     timestamptz not null default now()
);

create table if not exists quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  homework_id    uuid not null references homeworks (id) on delete cascade,
  version        text not null default 'both' check (version in ('A', 'B', 'both')),
  type           text not null check (type in ('mcq', 'short')),
  prompt         text not null,
  options        jsonb not null default '[]'::jsonb,
  correct_option int,
  points         int not null default 0,
  position       int not null default 0
);
create index if not exists quiz_questions_homework_idx on quiz_questions (homework_id, position);

create table if not exists submissions (
  id           uuid primary key default gen_random_uuid(),
  homework_id  uuid not null references homeworks (id) on delete cascade,
  student_id   uuid not null references users (id) on delete cascade,
  status       text not null default 'draft' check (status in ('draft', 'submitted')),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  days_late    int not null default 0,
  unique (homework_id, student_id)
);

create table if not exists answers (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references submissions (id) on delete cascade,
  question_id     uuid not null references quiz_questions (id) on delete cascade,
  answer_text     text,
  selected_option int,
  auto_points     int,
  manual_points   int,
  updated_at      timestamptz not null default now(),
  unique (submission_id, question_id)
);

create table if not exists uploads (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  file_name     text not null,
  file_type     text,
  size_bytes    bigint not null,
  storage_path  text not null,
  uploaded_at   timestamptz not null default now()
);

create table if not exists grades (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions (id) on delete cascade,
  quiz_points   int not null default 0,
  task_points   int not null default 0,
  late_penalty  int not null default 0,
  final_points  int not null default 0,
  comment       text,
  released_at   timestamptz
);

create table if not exists attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references users (id) on delete cascade,
  sunday_date date not null,
  present     boolean not null,
  note        text,
  unique (student_id, sunday_date)
);

create table if not exists activity_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references users (id) on delete cascade,
  event      text not null check (event in (
               'login', 'login_failed', 'logout', 'page_view', 'quiz_start',
               'answer_change', 'upload', 'submit', 'view_feedback')),
  detail     jsonb not null default '{}'::jsonb,
  device     text,
  browser    text,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_user_time_idx on activity_log (user_id, created_at desc);

-- One-row settings table.
create table if not exists settings (
  id                   int primary key default 1 check (id = 1),
  late_penalty_per_day int not null default 10,
  late_penalty_cap     int not null default 50,
  updated_at           timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

alter table users          enable row level security;
alter table homeworks      enable row level security;
alter table quiz_questions enable row level security;
alter table submissions    enable row level security;
alter table answers        enable row level security;
alter table uploads        enable row level security;
alter table grades         enable row level security;
alter table attendance     enable row level security;
alter table activity_log   enable row level security;
alter table settings       enable row level security;

-- The app's server connects with the secret (service_role) key. Grant it access
-- explicitly in case the project doesn't expose new tables automatically.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
