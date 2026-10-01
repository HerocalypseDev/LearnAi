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
