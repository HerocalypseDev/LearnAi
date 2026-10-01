import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { StatusPill } from "@/components/status-pill";
import { TopBar } from "@/components/top-bar";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/session";
import { loadStudentHomework } from "@/lib/student-data";
import { formatDateTime } from "@/lib/time";

export default async function HomeworkPage({ params }: PageProps<"/homework/[id]">) {
  const { id } = await params;
  const student = await requireUser("student");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [item] = await loadStudentHomework(student.id, id);
  if (!item) notFound();
  const { homework, status, grade, submission } = item;

  await logActivity(student.id, grade ? "view_feedback" : "page_view", { page: "homework", homework_id: id });

  const instructions = student.version === "B" ? homework.instructions_b : homework.instructions_a;
  const isOpen = status === "upcoming" || status === "in_progress";

  return (
    <>
      <TopBar name={student.full_name} home="/dashboard" />
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
          ← Back to dashboard
        </Link>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-indigo-600">Week {homework.week}</div>
              <h1 className="text-xl font-bold">{homework.title}</h1>
              <p className="mt-1 text-sm text-slate-500">Due {formatDateTime(homework.due_at)}</p>
            </div>
            <StatusPill status={status} />
          </div>
          {isOpen && <Countdown to={homework.due_at} className="mt-3 block font-medium" />}
          {submission?.submitted_at && (
            <p className="mt-3 text-sm text-slate-600">Handed in {formatDateTime(submission.submitted_at)}</p>
          )}
        </section>

        {grade && (
          <section className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
            <h2 className="font-semibold text-emerald-900">Your result</h2>
            <p className="mt-1 text-3xl font-bold text-emerald-800">
              {grade.final_points} <span className="text-lg font-medium">/ {homework.max_points}</span>
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-emerald-700">Quiz</dt>
                <dd className="font-semibold">
                  {grade.quiz_points} / {homework.quiz_points}
                </dd>
              </div>
              <div>
                <dt className="text-emerald-700">Task</dt>
                <dd className="font-semibold">
                  {grade.task_points} / {homework.task_points}
                </dd>
              </div>
              <div>
                <dt className="text-emerald-700">Late</dt>
                <dd className="font-semibold">{grade.late_penalty ? `−${grade.late_penalty}` : "0"}</dd>
              </div>
            </dl>
            {grade.comment && (
              <blockquote className="mt-4 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">
                {grade.comment}
              </blockquote>
            )}
          </section>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-2 font-semibold">Instructions</h2>
          {instructions ? (
            <div className="whitespace-pre-wrap leading-relaxed text-slate-800">{instructions}</div>
          ) : (
            <p className="text-sm text-slate-500">No instructions yet.</p>
          )}
        </section>

        <section className="rounded-2xl border-2 border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
          The quiz and file upload will appear here.
        </section>
      </main>
    </>
  );
}
