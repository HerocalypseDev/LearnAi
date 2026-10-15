@AGENTS.md

# AI Class Homework: project guide

Private homework app for one teacher (`admin`) and two students: **james** (version A) and **peter** (version B).
Next.js 16 App Router + React 19 + TypeScript, Supabase (Postgres + private Storage) via the secret key on the server only,
own login (bcrypt + jose JWT cookie), Vitest. Deployed on Vercel.

## Map

| Path | What |
|---|---|
| `src/lib/rules.ts` | **Pure business rules** (points split, lateness, penalty, visibility, upload limits, badges). Tested in `rules.test.ts`. Keep it free of I/O. |
| `src/lib/admin-ops.ts` | **Every admin mutation** (homework, questions, marks, attendance, settings, passwords). Used by both the website's server actions and the Jarvis API. Add new admin writes here, not in actions. |
| `src/app/actions/*` | Server actions: thin wrappers (auth check → admin-ops → revalidate/redirect). `student.ts` holds the student-side writes (answers, uploads, hand-in). |
| `src/lib/session.ts`, `src/app/actions/auth.ts` | Login, sessions, lockout. `requireUser(role)` guards every page and action. |
| `src/lib/student-data.ts`, `src/lib/marking.ts`, `src/lib/stats.ts` | Read models for student pages, marking and the admin overview. |
| `src/app/api/jarvis/route.ts`, `src/lib/jarvis/*` | Bearer-token tool API used by Jarvis's MCP server. Tool names, `input_schema` and `writes` are a contract; don't rename without versioning. |
| `src/lib/storage.ts` | Private `uploads` bucket helpers; signed links last 1 hour. |
| `supabase/schema.sql` | Canonical full schema for a fresh project. `supabase/migrations/*.sql` are deltas for older databases. |
| `docs/JARVIS_INTEGRATION_PLAN.md` | What the Jarvis side builds against this API. |

## Invariants (never break these)

- 100 points per homework: multiple choice 30 + short answer 10 (quiz 40) + task 60. Single source: `PARTS` in `rules.ts`.
- Late: each started day after the deadline loses `late_penalty_per_day`, capped at `late_penalty_cap`; final score never below 0. 1 second late = 1 day.
- A student sees a grade only when the deadline has passed **and** it is released (`isGradeVisible`). Enforce on the server.
- **Never send `correct_option` (or anything derived from it) to a student's browser.** Student queries select explicit columns without it.
- Students only ever read or change their own submissions, answers and files (check `student_id` on the server).
- All times are Africa/Lagos (fixed +01:00); use `src/lib/time.ts`.
- Marking truth: multiple choice points are recomputed from the current `quiz_questions` (`quizScore` in `rules.ts`), never trusted from stored `auto_points`.
- Hand-in locks the quiz and short answer only (also in the database: the `answers_lock` trigger refuses answer changes once submitted, but lets marking write points). Task files stay editable until the result is RELEASED (`taskLocked` in `student.ts`); a file added after the deadline raises `days_late` (`lateDaysAfterUpload`). Upload limits are enforced twice: in `student.ts` and by the `enforce_upload_rules` trigger (`schema.sql`; migrations 002, 003 and 004 all install the same final version, checked by `schema.test.ts`). Keep `MAX_FILES` and the trigger's 10 in step.
- Picture previews (`thumbnailPath` in `src/lib/storage.ts`) sit beside each file in a private `thumbs/` folder and are optional. Delete files with `removeFiles`, which removes their previews too; never make the bucket public.
- Student pages read in one wave with `requireUserWith` (data scoped to the cookie's user id, released only after the user check passes). Keep new reads in that `Promise.all` rather than awaiting them one after another; see `docs/PERFORMANCE.md`.
- Written pieces (`Writing-N.txt`, `src/lib/task-text.ts`): the server picks the name; editing uploads a new object and `confirmUpload({ replaceUploadId })` moves the row to it after the release check, never an in-place overwrite.
- The student homework page (`src/app/homework/[id]/page.tsx`) is a server component. Don't turn it into a client page that loads data through a server action: every column it selects would reach the browser.
- Text written by students is untrusted. Jarvis results that contain it use `student_*` field names and carry the untrusted note.
- The Supabase secret key, `SESSION_SECRET` and `JARVIS_API_TOKEN` stay server-side. Never import `db()` into a client component (`server-only` guards this).

## Commands

```bash
npm ci
npm run typecheck   # next typegen + tsc
npm test            # vitest
npm run lint
npm run build
```

## Deployment

After every change that modifies code:
1. Stage and commit changes with descriptive message
2. Push to `main` branch: `git push origin main`
3. Deploy to Vercel: `vercel --prod`

Always deploy after fixing bugs or adding features so production stays current.
