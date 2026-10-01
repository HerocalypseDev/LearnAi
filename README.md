# AI Class Homework

A private homework app for a 4-week AI class with one admin (the teacher) and two students.

- **Next.js** (App Router, TypeScript), hosted free on **Vercel**
- **Supabase** free tier: Postgres database and private file storage
- Its own username + password login. Passwords are hashed with bcrypt and sessions are signed cookies.
- All deadlines use Lagos time (WAT, UTC+1)

## What's built so far

- Database schema (`supabase/schema.sql`) and seed data for the admin and the two students (`supabase/seed.sql`)
- Login with lockout after 10 wrong tries in 15 minutes, plus logout
- Student dashboard with points, course progress for weeks 1–4, homework due next (live countdown), missed work and handed-in work
- Homework page showing the child's own version (A or B), with the task instructions inside the Task section, and the result once it is visible
- Quiz (multiple choice and short answer) that saves as the child types. Multiple choice is marked automatically, and correct answers never reach the browser.
- File uploads that go straight from the browser to private Supabase storage, with progress bars and previews for images and PDFs. Program files (.exe, .apk, .bat, .msi, .sh, .js and similar) are blocked, files are limited to 20MB each, and each homework takes at most 10 files.
- One final "Hand in" that locks the work and records how many days late it is
- Every homework has three sections: **1. Quiz** (multiple choice worth 30, marked automatically), **2. Short answer** (always 10 points, you mark it) and **3. Task** (60 points: your A/B instructions, then the file upload)
- Admin homework builder: title, week and due date/time (Lagos), then the three sections. Each shows a ✓ when it's complete for both versions, and the homework list says what's still to do.
- After an action you go back to the page above it: handing in goes to the dashboard; creating a homework goes to its page so you can add questions; **Done**, **Save changes**, marking and deleting go back to the list or the homework, with a green confirmation
- Marking: each homework's admin page lists James's and Peter's status. The marking page shows their answers (multiple choice auto-marked, with time spent per question), their files with previews, points boxes for short answers and the task, the late penalty applied automatically, and a comment. **Save** keeps it hidden, **Save & release** shows it to the child once the deadline has passed. The Overview lists everything waiting to be marked.
- Overview: both children side by side (points, average, on-time rate, missing work, attendance, last login, badges), with charts of score per homework and time spent on the quiz
- Attendance: Present/Absent and a note per Sunday (dates in `src/lib/course.ts`)
- Activity: every login, page, answer save (with time per question), upload, hand-in and result view, with device and browser, filterable by child and event
- CSV export of scores (with totals and badges), activity and attendance
- Badges for the kids: Lift-off, On the clock, Never late, Quiz master, Superstar, Finisher
- Settings: late penalty (points per day and cap) and passwords
- Lively interface: gradient buttons that lift and press, spinners while saving, cards that slide in and lift on hover, letter-bubble quiz answers that pop, drag-and-drop uploads, count-up points, confetti on hand-in and release, and an animated login. Motion turns off for devices set to reduce motion.
- Scores are hidden until the deadline has passed **and** the admin has released the marking. This is enforced on the server.

## One-time setup

### 1. Supabase (database)

1. Sign up at <https://supabase.com> and create a **New project**. Pick the region closest to Lagos (a Europe region is fine) and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, then click **Run**.
3. Paste all of `supabase/seed.sql` (James, version A, and Peter, version B) into a new query, then click **Run**.
4. Paste all of `supabase/storage.sql` into a new query, then click **Run**. It creates the private `uploads` storage bucket for homework files.
5. Go to **Project Settings → API Keys** and copy the **secret** key (it starts with `sb_secret_`). Then find the **Project URL** (`https://xxxx.supabase.co`) under **Project Settings → Data API**.

### 2. Vercel (website)

1. Sign up at <https://vercel.com> **with your GitHub account** and allow it to see the `LearnAi` repository.
2. Click **Add New → Project** and import `LearnAi`.
3. Before you click Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from Supabase |
   | `SUPABASE_SECRET_KEY` | the secret key from Supabase |
   | `SESSION_SECRET` | any random text of 32+ characters (e.g. from <https://generate-secret.vercel.app/32>) |
   | `ADMIN_PASSWORD` | the password you want for your `admin` login |

4. Click **Deploy**. You get an address like `learnai-xxxx.vercel.app`.

### 3. First login

1. Open the site and log in as `admin` with your `ADMIN_PASSWORD`. That password is then saved (hashed) in the database. You can change it later on the admin page.
2. On the admin page, set a password for each child.
3. The children log in with their name as the username (capital letters don't matter) and the password you gave them.

## Jarvis (optional): let your AI assistant act as the admin

The app has a private, token-protected **admin tool API** at `/api/jarvis`. It is not an MCP server itself: Jarvis runs its own small MCP server (see the plan below) that calls this API. Through it Jarvis can do everything you can do here, using the same rules as the website: read scores and progress, create and edit homework, mark, release, attendance, settings and CSV exports. Every change Jarvis makes shows in **Activity → 🤖 Jarvis**, and marks it saves are labelled **Marked by Jarvis**.

1. **Supabase:** paste `supabase/migrations/001_jarvis.sql` into the SQL Editor and click **Run**. It's safe to run twice.
2. **Vercel → Settings → Environment Variables:** add `JARVIS_API_TOKEN` (a random secret of 32+ characters; for example, run `python -c "import secrets; print(secrets.token_urlsafe(40))"`), then redeploy.
   - Optional: `JARVIS_API_READ_ONLY=1` lets Jarvis look but not change anything.
   - Delete the token to cut Jarvis off instantly.
3. **Jarvis side:** follow `docs/JARVIS_INTEGRATION_PLAN.md`, a step-by-step plan for Claude Code in the Jarvis repo.

**Settings → 🤖 Jarvis** shows whether access is on. On each homework, the Task section has a private **Marking notes** box. Jarvis follows these notes when it marks; the kids never see them.

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
npm test                     # rule tests: late penalty, score visibility, status
```

## Rules (`src/lib/rules.ts`)

- 100 points per homework: multiple choice 30 + short answer 10 (together the quiz, 40) + task 60. The single source in code is `PARTS` in `src/lib/rules.ts`.
- Late work is accepted but loses 10 points per started day after the deadline, up to 50. The per-day amount and the cap live in the `settings` table.
- Submitting at 21:01 on the due day counts as 1 day late.
