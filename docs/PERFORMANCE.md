# Performance notes

What makes pages slow here is almost always the number of **sequential** trips from the Vercel Function to
Supabase, multiplied by the distance between them. Count "waves": queries that wait for each other. Queries run
together with `Promise.all` count as one wave.

## Measuring

- **Vercel Speed Insights** (`<SpeedInsights />` in `src/app/layout.tsx`) records real-user TTFB, FCP, LCP, INP and
  CLS. Switch it on in the Vercel project (Speed Insights tab) once; numbers appear after a few visits.
- **Server timing**: `timed(label, fn)` in `src/lib/perf.ts` logs one line per Supabase/Storage call in production:
  `{"type":"db_timing","label":"homework:answers","ms":42}`. Search the Vercel logs for `db_timing`. Labels are fixed
  strings; never add ids, names, answers or tokens to them.

## Baseline (before the performance work, main at 2c69e39)

Checks: `npm run typecheck`, `npm test` (129 tests), `npm run lint` and `npm run build` all passed. Every route is
dynamic (`ƒ`), because the root layout reads `headers()` for the CSP nonce.

| Route / action | Sequential waves | Notes |
|---|---|---|
| `/dashboard` | 3 | user → homeworks + submissions + activity insert → grades |
| `/homework/[id]` | 5 (6 once graded) | user → homework + submissions → grades → questions, answers, uploads, settings, release, activity → signed URLs → (answer key for per-question points) |
| `/admin` | 2 | user → 10 queries; homeworks, students, submissions and grades are each read twice, and every `answer_change` row ever written is downloaded |
| `saveAnswer` | 6 | user → homework → question → submission → upsert → activity |
| `confirmUpload` | 9 or more | user → homework → submission → already recorded? → released? → Storage list (up to 3 tries, 300 ms apart) → file names → insert → activity; then `router.refresh()` re-renders the whole homework page |

Safety inventory at baseline: student pages (`/dashboard`, `/homework/[id]`) are server components; the only
question query that reaches the browser selects `id, version, type, prompt, options, points, position`. The
answer key is read in exactly one student path, `visibleQuestionPoints` (`src/lib/marking.ts`), which returns only
per-question numbers and runs only when the grade is visible. `src/test/student-isolation.test.ts` guards this.

## After (branch `claude/performance-optimizations-swgoiq`)

| Route / action | Sequential waves | How |
|---|---|---|
| `/dashboard` | 1 | `requireUserWith`: the user row, homeworks and the student's submissions with grades side by side |
| `/homework/[id]` | 1, then streaming | user, homework + submission + grade, questions, answers and uploads (joined through the student's own submission), settings, all at once. File links and a released result's per-question points are promises that stream in after the page |
| `/admin` | 2 | user → homeworks, students, submissions, grades, attendance (each read once, shared by the queue and the stats) and `quiz_active_ms()` |
| `saveAnswer` | 2 | user + question + submission → upsert. The activity row is written after the response |
| `requestUpload` | 2 | user + homework + submission (with release state and files, one query) → sign upload link(s) |
| `confirmUpload` | 2 | user + homework + submission/grade/files + storage listing → insert (link signed alongside). The list updates from the answer; no page re-render |
| `removeUpload` | 2 | user + file (ownership and release in one query) → delete. Storage cleanup runs after the response |

A first save or upload on a homework adds one wave to create the draft submission.

Measured locally with 100 ms added to every database and Storage request (a far-away region), median of 5 (3 for
uploads), main at 2c69e39 → this branch:

| | main | branch |
|---|---|---|
| `/dashboard` (full HTML) | 340 ms | 132 ms |
| `/homework/[id]` with 3 files (full HTML, links included) | 550 ms | 229 ms |
| `/homework/[id]` graded | 546 ms | 232 ms |
| Multiple choice click → "Saved ✓" | 867 ms | 354 ms |
| Upload one file → listed and idle | 2633 ms | 829 ms |
| `/admin` | 229 ms | 234 ms (same waves; no longer downloads every `answer_change` row) |

Answer keys in student paths after the change: `visibleQuestionPoints` as before, and `saveAnswer`, which reads the
question's `correct_option` on the server to store `auto_points` (the old code read it with `select("*")`). Neither
returns it. Student actions answer with `ok`/`error` plus, for uploads, the file's id, name, type, size and signed
links (never the storage path).

### Picture previews

Pictures of 150 KB or more get a 480 px JPEG preview made by the browser at upload (`makeThumbnail` in
`src/app/homework/[id]/uploads.tsx`), stored privately at `<folder>/thumbs/<file>.jpg` through its own signed upload
link. Lists show the preview; Preview/Open give the original. No preview (older uploads, small pictures, a browser
that can't read the format): the original is shown, as before. Supabase's image transformations would avoid the extra
upload but need a paid plan, so they aren't used.

### Not done, on purpose

- **Cache Components / `use cache` (Phase 10).** It builds once the root layout sets `instant = false`, but every
  shared read (homeworks, settings, questions) already runs in the same parallel wave as the student's own data, so
  caching saves no round trip. On Vercel the default `use cache` store is per-instance memory, which doesn't reliably
  persist between requests, and `use cache: remote` costs a network trip of its own. It would also add the risk of
  a student seeing a stale deadline or question after the teacher edits it. Revisit only if the database itself
  becomes the bottleneck.
- **Hash-based CSP / partial prerendering (Phase 15).** The nonce CSP stays. With every page down to one blocking
  wave, the dynamic render is no longer the slow part, and the route `loading.tsx` skeletons already give an instant
  shell on navigation. Hashes would have to track Next's inline scripts on every upgrade.
- **Cold starts (Phase 14).** `db()` creates the Supabase client lazily, once per instance, and nothing heavy runs at
  import time. Keep Fluid Compute on in Vercel (Settings → Functions) and the region aligned (`dub1` next to
  Supabase `eu-west-1`). No warmer cron: measure first (Speed Insights, `db_timing` logs).

### Database changes

Run `supabase/migrations/005_performance.sql` once on the live database: indexes on `uploads(submission_id)`,
`submissions(student_id)` and `activity_log(event, created_at)`, and `quiz_active_ms()` (callable only with the
server's key). The app works before it runs; the overview just falls back to adding up quiz time itself.
