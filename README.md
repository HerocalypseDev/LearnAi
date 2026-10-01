# AI Class Homework

A private homework app for a 4-week AI class with one admin (the teacher) and two students.

- **Next.js** (App Router, TypeScript), hosted free on **Vercel**
- **Supabase** free tier: Postgres database (file storage comes in phase 2)
- Its own username + password login. Passwords are hashed with bcrypt and sessions are signed cookies.
- All deadlines use Lagos time (WAT, UTC+1)

## What's built so far (phase 1)

- Database schema (`supabase/schema.sql`) and seed data for the admin and the two students (`supabase/seed.sql`)
- Login with lockout after 10 wrong tries in 15 minutes, plus logout
- Student dashboard with points, course progress for weeks 1–4, homework due next (live countdown), missed work and handed-in work
- Homework page showing the child's own version (A or B) of the instructions, and the result once it is visible
- Admin page with both students side by side, and setting each student's password and your own
- Activity log of logins, failed logins, logouts, page views and feedback views, each with device and browser
- Scores are hidden until the deadline has passed **and** the admin has released the marking. This is enforced on the server.

## One-time setup

### 1. Supabase (database)

1. Sign up at <https://supabase.com> and create a **New project**. Pick the region closest to Lagos (a Europe region is fine) and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, then click **Run**.
3. Paste all of `supabase/seed.sql` (James, version A, and Peter, version B) into a new query, then click **Run**.
4. Go to **Project Settings → API Keys** and copy the **secret** key (it starts with `sb_secret_`). Then find the **Project URL** (`https://xxxx.supabase.co`) under **Project Settings → Data API**.

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

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
npm test                     # rule tests: late penalty, score visibility, status
```

## Rules (`src/lib/rules.ts`)

- 100 points per homework: quiz 40 + task 60.
- Late work is accepted but loses 10 points per started day after the deadline, up to 50. The per-day amount and the cap live in the `settings` table.
- Submitting at 21:01 on the due day counts as 1 day late.
