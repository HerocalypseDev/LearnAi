import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteHomework } from "@/app/actions/homework-admin";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { cardClass, secondaryButtonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { versionNames } from "@/lib/student-data";
import { toLagosInputs } from "@/lib/time";
import type { Homework, QuizQuestion } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { HomeworkForm } from "../homework-form";
import { QuestionForm } from "../question-form";

export default async function EditHomeworkPage({ params }: PageProps<"/admin/homework/[id]">) {
  await requireUser("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: homework }, { data: questions }, names] = await Promise.all([
    db().from("homeworks").select("*").eq("id", id).maybeSingle<Homework>(),
    db().from("quiz_questions").select("*").eq("homework_id", id).order("position").order("id").returns<QuizQuestion[]>(),
    versionNames(),
  ]);
  if (!homework) notFound();

  const list = questions ?? [];
  const total = (v: "A" | "B") => list.filter((q) => q.version === v || q.version === "both").reduce((s, q) => s + q.points, 0);
  const nextPosition = list.reduce((max, q) => Math.max(max, q.position), 0) + 1;
  const due = toLagosInputs(homework.due_at);

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <Link href="/admin/homework" className="text-sm text-indigo-600 hover:underline">
          ← All homework
        </Link>

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
              Quiz total — {names.A} (A): <Total value={total("A")} target={homework.quiz_points} /> · {names.B} (B):{" "}
              <Total value={total("B")} target={homework.quiz_points} />. Multiple choice is marked automatically; you mark
              short answers.
            </p>
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
              question={{ type: "mcq", version: "both", prompt: "", options: [], correct_option: 0, points: 5, position: nextPosition }}
            />
          </div>
        </section>

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
  return <span className={value === target ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>{value}/{target}</span>;
}
