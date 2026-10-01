import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { StatusPill } from "@/components/status-pill";
import { TopBar } from "@/components/top-bar";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { DEFAULT_PENALTY } from "@/lib/rules";
import { signedLinks } from "@/lib/storage";
import { loadStudentHomework } from "@/lib/student-data";
import { formatDateTime } from "@/lib/time";
import type { Answer, Settings, StudentQuestion, Upload } from "@/lib/types";
import { Quiz, type SavedAnswer } from "./quiz";
import { SubmitPanel } from "./submit-panel";
import { Uploads, type UploadView } from "./uploads";

export default async function HomeworkPage({ params }: PageProps<"/homework/[id]">) {
  const { id } = await params;
  const student = await requireUser("student");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [item] = await loadStudentHomework(student.id, id);
  if (!item) notFound();
  const { homework, status, grade, submission } = item;

  const [{ data: questions }, { data: answers }, { data: uploads }, { data: settings }] = await Promise.all([
    db()
      .from("quiz_questions")
      // Never select correct_option here: this goes to the browser.
      .select("id, version, type, prompt, options, points, position")
      .eq("homework_id", id)
      .in("version", ["both", student.version ?? "A"])
      .order("position")
      .order("id")
      .returns<StudentQuestion[]>(),
    submission
      ? db().from("answers").select("*").eq("submission_id", submission.id).returns<Answer[]>()
      : Promise.resolve({ data: [] as Answer[] }),
    submission
      ? db().from("uploads").select("*").eq("submission_id", submission.id).order("uploaded_at").returns<Upload[]>()
      : Promise.resolve({ data: [] as Upload[] }),
    db().from("settings").select("late_penalty_per_day, late_penalty_cap").eq("id", 1).maybeSingle<Settings>(),
    logActivity(student.id, grade ? "view_feedback" : "page_view", { page: "homework", homework_id: id }),
  ]);

  const quiz = questions ?? [];
  const links = await signedLinks((uploads ?? []).map((u) => u.storage_path));
  const uploadViews: UploadView[] = (uploads ?? []).map((u) => ({
    id: u.id,
    file_name: u.file_name,
    file_type: u.file_type,
    size_bytes: u.size_bytes,
    link: links[u.storage_path] ?? null,
  }));
  const saved: Record<string, SavedAnswer> = {};
  const earned: Record<string, number | null> = {};
  for (const a of answers ?? []) {
    saved[a.question_id] = { answer_text: a.answer_text, selected_option: a.selected_option };
    earned[a.question_id] = a.manual_points ?? a.auto_points;
  }
  const unanswered = quiz.filter((q) => {
    const a = saved[q.id];
    return !a || (q.type === "mcq" ? a.selected_option === null : !a.answer_text?.trim());
  }).length;

  const locked = submission?.status === "submitted";
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

        {quiz.length > 0 && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Quiz</h2>
            <Quiz homeworkId={id} questions={quiz} initial={saved} locked={locked} earned={grade ? earned : undefined} />
          </section>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Your files</h2>
          <Uploads homeworkId={id} uploads={uploadViews} locked={locked} />
        </section>

        {locked ? (
          <section className="rounded-2xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200">
            <p className="font-semibold text-emerald-800">✅ Handed in</p>
            <p className="mt-1 text-sm text-emerald-700">
              {grade ? "Your result is above." : "Your teacher will mark it after the deadline."}
            </p>
          </section>
        ) : (
          <SubmitPanel
            homeworkId={id}
            dueAt={homework.due_at}
            unanswered={unanswered}
            fileCount={uploadViews.length}
            penalty={{
              perDay: settings?.late_penalty_per_day ?? DEFAULT_PENALTY.perDay,
              cap: settings?.late_penalty_cap ?? DEFAULT_PENALTY.cap,
            }}
          />
        )}
      </main>
    </>
  );
}
