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
