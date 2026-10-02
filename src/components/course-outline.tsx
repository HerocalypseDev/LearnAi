import { cardClass } from "@/components/ui";
import { COURSE_OUTLINE, currentWeekIndex, lagosToday } from "@/lib/course";
import { formatDate } from "@/lib/time";

/** The month's course outline from the Student Handbook. Same for every student. */
export function CourseOutline() {
  const current = currentWeekIndex(lagosToday(new Date()));
  // Open the class we're in, or the first one if the course hasn't started.
  const focus = Math.max(current, 0);

  return (
    <section className={cardClass}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-semibold">Course outline · October</h2>
        <span className="text-xs text-slate-500">4 Sundays after service</span>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        Bring your charged laptop and a notes document. Take notes every class, because the quizzes come from them.
      </p>

      <ol className="space-y-2">
        {COURSE_OUTLINE.map((w, i) => {
          const state = i < current ? "done" : i === current ? "now" : i === current + 1 ? "next" : "later";
          return (
            <li key={w.week}>
              <details
                open={i === focus}
                className="group rounded-xl ring-1 ring-slate-200 transition open:bg-indigo-50/40 open:ring-indigo-200 hover:ring-indigo-300"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-3 [&::-webkit-details-marker]:hidden">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      state === "now"
                        ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white"
                        : state === "done"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {state === "done" ? "✓" : w.week}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-slate-500">
                      Week {w.week} · {formatDate(`${w.date}T12:00:00+01:00`)}
                    </span>
                    <span className="block font-semibold">{w.topic}</span>
                  </span>
                  {(state === "now" || state === "next") && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        state === "now" ? "bg-indigo-600 text-white" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {state === "now" ? "This week" : "Next class"}
                    </span>
                  )}
                  <span className="text-slate-400 transition group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                </summary>

                <div className="space-y-3 px-3 pb-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">You will learn</div>
                    <p className="text-slate-700">{w.learn}</p>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">You will do</div>
                    <p className="text-slate-700">{w.doThis}</p>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Words to know</div>
                    <ul className="mt-1 space-y-1">
                      {w.terms.map((t) => (
                        <li key={t.word} className="text-slate-700">
                          <span className="font-semibold text-slate-900">{t.word}:</span> {t.meaning}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 p-3 text-sm ring-1 ring-amber-200">
        <div className="font-semibold">🎤 Final showcase · Sunday 25 October</div>
        <p className="mt-1 text-slate-700">
          At the end of Week 4 you present what you learned to your parents: a 5-minute presentation on the AI topic you choose in Week 3,
          then a 3-minute demo of your Python chatbot, then your parents&apos; questions.
        </p>
      </div>
    </section>
  );
}
