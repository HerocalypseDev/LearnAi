import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteHomework } from "@/app/actions/homework-admin";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { buttonClass, cardClass, dangerButtonClass } from "@/components/ui";
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
import { TaskForm } from "../task-form";

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
  const mcq = list.filter((q) => q.type === "mcq");
  const short = list.filter((q) => q.type === "short");
  const totals = (v: "A" | "B") => quizTotals(list.filter((q) => q.version === v || q.version === "both"));
  const nextPosition = list.reduce((max, q) => Math.max(max, q.position), 0) + 1;
  const due = toLagosInputs(homework.due_at);

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="stagger mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
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
            values={{ id: homework.id, week: homework.week, title: homework.title, due_date: due.date, due_time: due.time }}
          />
        </section>

        {/* 1. Quiz: multiple choice only */}
        <section className="space-y-3">
          <SectionHeading
            n={1}
            title="Quiz"
            points={PARTS.mcq}
            note="Multiple choice, marked automatically. Questions for each version must add up to 30."
            checks={(["A", "B"] as const).map((v) => ({ label: `${names[v]} (${v})`, value: totals(v).mcq, target: PARTS.mcq }))}
          />
          {mcq.map((q, i) => (
            <div key={q.id} className={cardClass}>
              <div className="mb-2 text-sm font-semibold text-slate-500">Quiz question {i + 1}</div>
              <QuestionForm homeworkId={homework.id} question={q} names={names} />
            </div>
          ))}
          <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-white p-5">
            <div className="mb-2 text-sm font-semibold text-indigo-700">Add a quiz question</div>
            <QuestionForm
              key={`new-mcq-${mcq.length}`}
              homeworkId={homework.id}
              names={names}
              question={{ type: "mcq", version: "both", prompt: "", options: [], correct_option: 0, points: 3, position: nextPosition }}
            />
          </div>
        </section>

        {/* 2. Short answer: fixed 10 points */}
        <section className="space-y-3">
          <SectionHeading
            n={2}
            title="Short answer"
            points={PARTS.short}
            note="A short explanation you mark yourself. Always worth 10 points: add one for both, or one each for A and B."
            checks={(["A", "B"] as const).map((v) => ({ label: `${names[v]} (${v})`, value: totals(v).short, target: PARTS.short }))}
          />
          {short.map((q) => (
            <div key={q.id} className={cardClass}>
              <QuestionForm homeworkId={homework.id} question={q} names={names} />
            </div>
          ))}
          {(totals("A").short < PARTS.short || totals("B").short < PARTS.short) && (
            <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-white p-5">
              <div className="mb-2 text-sm font-semibold text-indigo-700">Add the short answer question</div>
              <QuestionForm
                key={`new-short-${short.length}`}
                homeworkId={homework.id}
                names={names}
                question={{
                  type: "short",
                  version: short.length === 0 ? "both" : totals("A").short < PARTS.short ? "A" : "B",
                  prompt: "",
                  options: [],
                  correct_option: null,
                  points: PARTS.short,
                  position: nextPosition,
                }}
              />
            </div>
          )}
        </section>

        {/* 3. Task: instructions shown to the child above the upload box */}
        <section className="space-y-3">
          <SectionHeading
            n={3}
            title="Task"
            points={PARTS.task}
            note="The kids see these instructions in the Task section, above where they upload their file. You mark it out of 60."
            checks={[
              { label: `${names.A} (A)`, value: homework.instructions_a.trim() ? 1 : 0, target: 1, text: homework.instructions_a.trim() ? "written" : "missing" },
              { label: `${names.B} (B)`, value: homework.instructions_b.trim() ? 1 : 0, target: 1, text: homework.instructions_b.trim() ? "written" : "missing" },
            ]}
          />
          <div className={cardClass}>
            <TaskForm id={homework.id} a={homework.instructions_a} b={homework.instructions_b} names={names} />
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
            <ConfirmButton message={`Delete "${homework.title}" and everything submitted for it?`} className={dangerButtonClass}>
              Delete homework
            </ConfirmButton>
          </form>
        </section>
      </main>
    </>
  );
}

function SectionHeading({
  n,
  title,
  points,
  note,
  checks,
}: {
  n: number;
  title: string;
  points: number;
  note: string;
  checks: { label: string; value: number; target: number; text?: string }[];
}) {
  return (
    <div className="space-y-2 pt-2">
      <h2 className="flex items-baseline justify-between gap-3 text-lg font-bold">
        <span>
          <span className="mr-2 rounded-md bg-indigo-100 px-1.5 py-0.5 text-sm font-bold text-indigo-700">{n}</span>
          {title}
        </span>
        <span className="text-sm font-semibold text-slate-500">{points} points</span>
      </h2>
      <p className="text-sm text-slate-500">{note}</p>
      <ul className="flex flex-wrap gap-2 text-xs">
        {checks.map((c) => {
          const ok = c.value === c.target;
          return (
            <li key={c.label} className={`rounded-full px-2.5 py-1 font-medium ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              {c.label}: {c.text ?? `${c.value}/${c.target}`} {ok ? "✓" : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
