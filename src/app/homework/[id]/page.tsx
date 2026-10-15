import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { StatusPill } from "@/components/status-pill";
import { LinkPending } from "@/components/navigation-progress";
import { TopBar } from "@/components/top-bar";
import { linkPendingClass } from "@/components/ui";
import { logActivityInBackground } from "@/lib/activity";
import { db } from "@/lib/db";
import { visibleQuestionPoints } from "@/lib/marking";
import { timed } from "@/lib/perf";
import { DEFAULT_PENALTY, PARTS } from "@/lib/rules";
import { requireUserWith } from "@/lib/session";
import { signedLinks } from "@/lib/storage";
import { loadStudentHomework } from "@/lib/student-data";
import { formatDateTime } from "@/lib/time";
import type { Answer, Settings, StudentQuestion, Upload } from "@/lib/types";
import { Quiz, type SavedAnswer } from "./quiz";
import { SubmitPanel } from "./submit-panel";
import { HandedInNote, TaskSection } from "./task-section";
import type { UploadView } from "./uploads";

// A server component on purpose: everything below is read with the server's key, and only the props passed to the
// client components (Quiz, TaskSection, SubmitPanel) reach the browser. Never the answer key, auto-marked points
// before release, the teacher's marking notes or the student's own user row.
export default async function HomeworkPage({ params }: PageProps<"/homework/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // One wave after the cookie check: the user row and everything this page reads, side by side. Answers and uploads
  // are reached through the student's own submission (inner join on student_id), so they don't wait for it.
  const [student, [[item], { data: questions }, { data: answers }, { data: uploads }, { data: settings }]] = await requireUserWith(
    "student",
    (studentId) =>
      Promise.all([
        loadStudentHomework(studentId, id),
        timed("homework:questions", () =>
          db()
            .from("quiz_questions")
            // Explicit columns: this goes to the browser. Both versions are read here (the user row isn't known yet)
            // and the other version's questions are dropped below, before anything reaches the browser.
            .select("id, version, type, prompt, options, points, position")
            .eq("homework_id", id)
            .order("position")
            .order("id")
            .returns<StudentQuestion[]>(),
        ),
        timed("homework:answers", () =>
          db()
            .from("answers")
            .select("question_id, answer_text, selected_option, manual_points, submissions!inner(student_id)")
            .eq("submissions.student_id", studentId)
            .eq("submissions.homework_id", id)
            .returns<Pick<Answer, "question_id" | "answer_text" | "selected_option" | "manual_points">[]>(),
        ),
        timed("homework:uploads", () =>
          db()
            .from("uploads")
            .select("id, file_name, file_type, size_bytes, storage_path, uploaded_at, submissions!inner(student_id)")
            .eq("submissions.student_id", studentId)
            .eq("submissions.homework_id", id)
            .order("uploaded_at")
            .order("id")
            .returns<Omit<Upload, "submission_id">[]>(),
        ),
        timed("homework:settings", () =>
          db().from("settings").select("late_penalty_per_day, late_penalty_cap").eq("id", 1).maybeSingle<Settings>(),
        ),
      ]),
  );
  if (!item) notFound();
  const { homework, status, grade, submission, released } = item;

  logActivityInBackground(student.id, grade ? "view_feedback" : "page_view", { page: "homework", homework_id: id });

  const version = student.version ?? "A";
  const quiz = (questions ?? []).filter((q) => q.version === "both" || q.version === version).map((q) => ({ ...q, options: Array.isArray(q.options) ? q.options.map(String) : [] }));
  const mcq = quiz.filter((q) => q.type === "mcq");
  const short = quiz.filter((q) => q.type === "short");
  const uploadViews: UploadView[] = (uploads ?? []).map((u) => ({
    id: u.id,
    file_name: u.file_name,
    file_type: u.file_type,
    size_bytes: u.size_bytes,
  }));
  // Signing the file links is a Storage call: it isn't awaited here, so the quiz renders without waiting for it.
  // The promise streams to the browser and each file's Preview / Edit appears once it settles (uploads.tsx).
  const links = linksById(uploads ?? []);
  const saved: Record<string, SavedAnswer> = {};
  const marks: Record<string, { selected_option: number | null; manual_points: number | null }> = {};
  for (const a of answers ?? []) {
    saved[a.question_id] = { answer_text: a.answer_text, selected_option: a.selected_option };
    marks[a.question_id] = { selected_option: a.selected_option, manual_points: a.manual_points };
  }
  // Per-question points only once the result is visible, re-marked from the current questions like the total was.
  // Not awaited: the page (and the total above) shows at once, and each question's points stream in after.
  const earned = grade ? visibleQuestionPoints(quiz.map((q) => q.id), marks).catch(() => ({}) as Record<string, number | null>) : undefined;
  const unansweredIds = quiz
    .filter((q) => {
      const a = saved[q.id];
      return !a || (q.type === "mcq" ? a.selected_option === null : !a.answer_text?.trim());
    })
    .map((q) => q.id);

  // Quiz and short answer lock at hand-in; task files stay open until the teacher releases the result.
  const locked = submission?.status === "submitted";
  const taskLocked = released;
  const instructions = student.version === "B" ? homework.instructions_b : homework.instructions_a;
  const isOpen = status === "upcoming" || status === "in_progress";

  return (
    <>
      <TopBar name={student.full_name} home="/dashboard" />
      <main className="stagger mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <Link href="/dashboard" className={`${linkPendingClass} inline-flex items-center text-sm text-indigo-600 hover:underline`}>
          ← Back to dashboard
          <LinkPending />
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
          <section className="animate-pop rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm ring-1 ring-emerald-200">
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

        {mcq.length > 0 && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <PartHeading part={1} title="Quiz" points={PARTS.mcq} />
            <Quiz homeworkId={id} questions={mcq} initial={saved} locked={locked} earned={earned} />
          </section>
        )}

        {short.length > 0 && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <PartHeading part={2} title="Short answer" points={PARTS.short} />
            <Quiz homeworkId={id} questions={short} initial={saved} locked={locked} earned={earned} />
          </section>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <PartHeading part={3} title="Task" points={PARTS.task} />
          {instructions ? (
            <div className="mb-4 whitespace-pre-wrap rounded-xl bg-indigo-50 p-4 leading-relaxed text-slate-800">{instructions}</div>
          ) : (
            <p className="mb-4 text-sm text-slate-500">No task instructions yet.</p>
          )}
          <p className="mb-3 text-sm font-medium text-slate-700">When you&apos;ve done the task, upload your work here:</p>
          {locked && !taskLocked && (
            <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
              Your quiz is handed in, but you can still add or change your task files here until your teacher releases your result.
              {" Files added or changed after the deadline count as late."}
            </p>
          )}
          <TaskSection homeworkId={id} studentId={student.id} uploads={uploadViews} links={links} locked={taskLocked} />
        </section>

        {locked ? (
          <section className="animate-pop rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-5 text-center shadow-sm ring-1 ring-emerald-200">
            <p className="font-semibold text-emerald-800">✅ Quiz and short answer handed in</p>
            <p className="mt-1 text-sm text-emerald-700">
              {grade ? "Your result is above." : <HandedInNote fileCount={uploadViews.length} taskLocked={taskLocked} />}
            </p>
          </section>
        ) : (
          <SubmitPanel
            homeworkId={id}
            dueAt={homework.due_at}
            unansweredIds={unansweredIds}
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

/** Signed links by upload id (never the storage paths), for the browser. */
async function linksById(uploads: Pick<Upload, "id" | "storage_path">[]): Promise<Record<string, string>> {
  if (uploads.length === 0) return {};
  // signedLinks reports its own errors; this also keeps a thrown network error from breaking the page.
  const byPath = await signedLinks(uploads.map((u) => u.storage_path)).catch(() => ({}) as Record<string, string>);
  const out: Record<string, string> = {};
  for (const u of uploads) if (byPath[u.storage_path]) out[u.id] = byPath[u.storage_path];
  return out;
}

function PartHeading({ part, title, points }: { part: number; title: string; points: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-semibold">
        <span className="mr-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">Part {part}</span>
        {title}
      </h2>
      <span className="shrink-0 text-sm text-slate-500">{points} points</span>
    </div>
  );
}
