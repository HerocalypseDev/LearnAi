import Link from "next/link";
import { Flash } from "@/components/flash";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { buttonClass, cardClass, linkCardClass } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import { PARTS, quizTotals } from "@/lib/rules";
import type { Homework, QuizQuestion } from "@/lib/types";

export default async function HomeworkListPage({ searchParams }: PageProps<"/admin/homework">) {
  await requireUser("admin");
  const { done } = await searchParams;
  const [{ data: homeworks, error }, { data: questions }] = await Promise.all([
    db().from("homeworks").select("*").order("due_at").returns<Homework[]>(),
    db()
      .from("quiz_questions")
      .select("homework_id, version, type, points")
      .returns<Pick<QuizQuestion, "homework_id" | "version" | "type" | "points">[]>(),
  ]);
  if (error) throw new Error(error.message);

  /** What still needs doing before a homework is ready for the kids. */
  const missing = (h: Homework) => {
    const out: string[] = [];
    for (const v of ["A", "B"] as const) {
      const t = quizTotals((questions ?? []).filter((q) => q.homework_id === h.id && (q.version === v || q.version === "both")));
      if (t.mcq !== PARTS.mcq) out.push(`quiz ${v} (${t.mcq}/${PARTS.mcq})`);
      if (t.short !== PARTS.short) out.push(`short answer ${v}`);
      if (!(v === "A" ? h.instructions_a : h.instructions_b).trim()) out.push(`task instructions ${v}`);
    }
    return out;
  };

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <Flash done={done} />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Homework</h1>
          <Link href="/admin/homework/new" className={buttonClass}>
            + New homework
          </Link>
        </div>

        {(homeworks ?? []).length === 0 ? (
          <p className={`${cardClass} text-sm text-slate-500`}>No homework yet. Click “New homework” to create the first one.</p>
        ) : (
          <ul className="stagger space-y-2">
            {(homeworks ?? []).map((h) => {
              const todo = missing(h);
              return (
                <li key={h.id}>
                  <Link href={`/admin/homework/${h.id}`} className={linkCardClass}>
                    <div className="text-xs font-medium text-indigo-600">Week {h.week}</div>
                    <div className="font-semibold">{h.title}</div>
                    <div className="text-sm text-slate-500">Due {formatDateTime(h.due_at)}</div>
                    <div className={`mt-1 text-xs font-medium ${todo.length ? "text-amber-700" : "text-emerald-700"}`}>
                      {todo.length ? `Still to do: ${todo.join(", ")}` : "Quiz, short answer and task ready for both ✓"}
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
