import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteHomework } from "@/app/actions/homework-admin";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { buttonClass, cardClass, secondaryButtonClass } from "@/components/ui";
import { Flash } from "@/components/flash";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { versionNames } from "@/lib/student-data";
import { toLagosInputs } from "@/lib/time";
import { PARTS, quizTotals } from "@/lib/rules";
import type { Homework, QuizQuestion } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmissionRow } from "@/components/submission-row";
import { loadSubmissionSummaries } from "@/lib/marking";
import { HomeworkForm } from "../homework-form";
import { QuestionForm } from "../question-form";

export default async function EditHomeworkPage({ params, searchParams }: PageProps<"/admin/homework/[id]">) {
  await requireUser("admin");
  const { id } = await params;
  const { done } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: homework }, { data: questions }, names, summaries] = await Promise.all([
    db().from("homeworks").select("*").eq("id", id).maybeSingle<Homework>(),
    db().from("quiz_questions").select("*").eq("homework_id", id).order("position").order("id").returns<QuizQuestion[]>(),
    versionNames(),
    loadSubmissionSummaries(id),
  ]);
  if (!homework) notFound();

  const list = questions ?? [];
  const totals = (v: "A" | "B") => quizTotals(list.filter((q) => q.version === v || q.version === "both"));
  const nextPosition = list.reduce((max, q) => Math.max(max, q.position), 0) + 1;
  const due = toLagosInputs(homework.due_at);

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin/homework" className="text-sm text-indigo-600 hover:underline">
            ← All homework
          </Link>
          <Link href="/admin/homework?done=saved" className={buttonClass}>
            Done ✓
          </Link>
        </div>
        <Flash done={done} />

        <section className="space-y-2">
          <h2 className="text-lg font-bold">Students&apos; work</h2>
          {summaries.map((item) => (
            <SubmissionRow key={item.student.id} item={item} />
          ))}
        </section>

        <section className={cardClass}>
          <h1 className="mb-4 text-xl font-bold">{homework.title}</h1>
          <HomeworkForm
            names={names}
            values={{
              id: homework.id,
              week: homework.week,
              title: homework.title,
              due_date: due.date,
              due_time: due.time,
              instructions_a: homework.instructions_a,
              instructions_b: homework.instructions_b,
            }}
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">Quiz questions</h2>
            <p className="text-sm text-slate-500">
              Each version needs <b>multiple choice worth {PARTS.mcq}</b> (marked automatically) and a <b>short explanation worth{" "}
              {PARTS.short}</b> (you mark it). The task ({PARTS.task}) is the file they upload, described in the instructions above.
            </p>
            <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {(["A", "B"] as const).map((v) => {
                const t = totals(v);
                return (
                  <li key={v} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="font-medium">
                      {names[v]} ({v})
                    </div>
                    Multiple choice <Total value={t.mcq} target={PARTS.mcq} /> · Explanation <Total value={t.short} target={PARTS.short} />
                  </li>
                );
              })}
            </ul>
          </div>

          {list.map((q, i) => (
            <div key={q.id} className={cardClass}>
              <div className="mb-2 text-sm font-semibold text-slate-500">Question {i + 1}</div>
              <QuestionForm homeworkId={homework.id} question={q} names={names} />
            </div>
          ))}

          <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-white p-5">
            <div className="mb-2 text-sm font-semibold text-indigo-700">Add a question</div>
            <QuestionForm
              key={`new-${list.length}`}
              homeworkId={homework.id}
              names={names}
              question={{ type: "mcq", version: "both", prompt: "", options: [], correct_option: 0, points: 3, position: nextPosition }}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <Link href="/admin/homework?done=saved" className={buttonClass}>
            Done — back to all homework
          </Link>
        </div>

        <section className={`${cardClass} border border-red-100`}>
          <h2 className="font-semibold text-red-800">Delete homework</h2>
          <p className="mb-3 text-sm text-slate-500">Deletes the homework, its questions and every answer and grade for it.</p>
          <form action={deleteHomework}>
            <input type="hidden" name="id" value={homework.id} />
            <ConfirmButton message={`Delete "${homework.title}" and everything submitted for it?`} className={`${secondaryButtonClass} text-red-700`}>
              Delete homework
            </ConfirmButton>
          </form>
        </section>
      </main>
    </>
  );
}

function Total({ value, target }: { value: number; target: number }) {
  return (
    <span className={value === target ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
      {value}/{target}
      {value === target ? " ✓" : ""}
    </span>
  );
}
