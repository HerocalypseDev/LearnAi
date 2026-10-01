import Link from "next/link";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { buttonClass, cardClass } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import type { Homework, QuizQuestion } from "@/lib/types";

export default async function HomeworkListPage() {
  await requireUser("admin");
  const [{ data: homeworks, error }, { data: questions }] = await Promise.all([
    db().from("homeworks").select("*").order("due_at").returns<Homework[]>(),
    db().from("quiz_questions").select("homework_id, version, points").returns<Pick<QuizQuestion, "homework_id" | "version" | "points">[]>(),
  ]);
  if (error) throw new Error(error.message);

  const quizTotal = (homeworkId: string, version: "A" | "B") =>
    (questions ?? [])
      .filter((q) => q.homework_id === homeworkId && (q.version === version || q.version === "both"))
      .reduce((sum, q) => sum + q.points, 0);

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Homework</h1>
          <Link href="/admin/homework/new" className={buttonClass}>
            + New homework
          </Link>
        </div>

        {(homeworks ?? []).length === 0 ? (
          <p className={`${cardClass} text-sm text-slate-500`}>No homework yet. Click “New homework” to create the first one.</p>
        ) : (
          <ul className="space-y-2">
            {(homeworks ?? []).map((h) => {
              const a = quizTotal(h.id, "A");
              const b = quizTotal(h.id, "B");
              return (
                <li key={h.id}>
                  <Link href={`/admin/homework/${h.id}`} className={`block ${cardClass} hover:ring-indigo-300`}>
                    <div className="text-xs font-medium text-indigo-600">Week {h.week}</div>
                    <div className="font-semibold">{h.title}</div>
                    <div className="text-sm text-slate-500">Due {formatDateTime(h.due_at)}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Quiz points: A {a}/{h.quiz_points} · B {b}/{h.quiz_points}
                      {(a !== h.quiz_points || b !== h.quiz_points) && (
                        <span className="ml-1 font-semibold text-amber-700">(should be {h.quiz_points})</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
