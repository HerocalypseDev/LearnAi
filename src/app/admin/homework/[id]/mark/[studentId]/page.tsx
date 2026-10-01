import Link from "next/link";
import { notFound } from "next/navigation";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { cardClass } from "@/components/ui";
import { loadMarking, questionPoints } from "@/lib/marking";
import { requireUser } from "@/lib/session";
import { signedLinks } from "@/lib/storage";
import { formatDateTime, isPast } from "@/lib/time";
import { MarkForm } from "./mark-form";

const UUID = /^[0-9a-f-]{36}$/i;

const EVENT_LABELS: Record<string, string> = {
  page_view: "Opened the homework",
  view_feedback: "Viewed the result",
  quiz_start: "Started",
  answer_change: "Answer saved",
  upload: "File",
  submit: "Handed in",
};

export default async function MarkPage({ params }: PageProps<"/admin/homework/[id]/mark/[studentId]">) {
  await requireUser("admin");
  const { id, studentId } = await params;
  if (!UUID.test(id) || !UUID.test(studentId)) notFound();

  const data = await loadMarking(id, studentId);
  if (!data) notFound();
  const { homework, student, submission, questions, answers, uploads, grade, penalty, secondsPerQuestion, timeline } = data;
  const links = await signedLinks(uploads.map((u) => u.storage_path));
  const deadlinePassed = isPast(homework.due_at);
  const submitted = submission?.status === "submitted";

  // Collapse the stream of autosaves into one line per run of saves.
  const events = timeline.filter((e, i) => !(e.event === "answer_change" && timeline[i + 1]?.event === "answer_change"));

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <Link href={`/admin/homework/${homework.id}`} className="text-sm text-indigo-600 hover:underline">
          ← {homework.title}
        </Link>

        <section className={cardClass}>
          <div className="text-xs font-medium text-indigo-600">
            Week {homework.week} · Version {student.version}
          </div>
          <h1 className="text-xl font-bold">
            {student.full_name} — {homework.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Due {formatDateTime(homework.due_at)}</p>
          <p className="mt-1 text-sm">
            {submitted && submission?.submitted_at ? (
              <>
                Handed in {formatDateTime(submission.submitted_at)}{" "}
                {submission.days_late > 0 ? (
                  <span className="font-semibold text-orange-700">
                    ({submission.days_late} day{submission.days_late === 1 ? "" : "s"} late)
                  </span>
                ) : (
                  <span className="font-semibold text-emerald-700">(on time)</span>
                )}
              </>
            ) : submission ? (
              <span className="font-semibold text-amber-700">Started but not handed in yet.</span>
            ) : (
              <span className="font-semibold text-slate-500">Not started.</span>
            )}
          </p>
        </section>

        <section className={cardClass}>
          <h2 className="mb-2 text-lg font-bold">Task files ({uploads.length})</h2>
          {uploads.length === 0 ? (
            <p className="text-sm text-slate-500">No files attached.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {uploads.map((u) => {
                const link = links[u.storage_path];
                const image = /^image\//.test(u.file_type ?? "");
                return (
                  <li key={u.id} className="rounded-xl border border-slate-200 p-2">
                    {image && link && (
                      <a href={link} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
                        <img src={link} alt={u.file_name} className="mb-2 max-h-48 w-full rounded-lg object-contain" />
                      </a>
                    )}
                    <div className="truncate text-sm font-medium">{u.file_name}</div>
                    <div className="text-xs text-slate-500">
                      {(u.size_bytes / 1024 / 1024).toFixed(2)} MB · {formatDateTime(u.uploaded_at)}
                    </div>
                    {link && (
                      <a href={link} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline">
                        Open
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {submitted && submission ? (
          <MarkForm
            homeworkId={homework.id}
            studentId={student.id}
            quizMax={homework.quiz_points}
            taskMax={homework.task_points}
            maxPoints={homework.max_points}
            daysLate={submission.days_late}
            penalty={penalty}
            initialTask={grade?.task_points ?? null}
            initialComment={grade?.comment ?? ""}
            released={!!grade?.released_at}
            deadlinePassed={deadlinePassed}
            questions={questions.map((q) => ({
              id: q.id,
              type: q.type,
              prompt: q.prompt,
              options: q.options,
              correct_option: q.correct_option,
              points: q.points,
              answer_text: answers[q.id]?.answer_text ?? null,
              selected_option: answers[q.id]?.selected_option ?? null,
              earned: questionPoints(q, answers[q.id]),
              seconds: secondsPerQuestion[q.id] ?? null,
            }))}
          />
        ) : (
          <p className={`${cardClass} text-sm text-slate-500`}>You can mark this once {student.full_name} hands it in.</p>
        )}

        <section className={cardClass}>
          <h2 className="mb-2 text-lg font-bold">Activity</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-36 shrink-0 text-slate-500">{formatDateTime(e.created_at)}</span>
                  <span>
                    {EVENT_LABELS[e.event] ?? e.event}
                    {e.event === "upload" && `: ${e.detail.removed ? "removed" : "added"} ${String(e.detail.file_name ?? "")}`}
                    {e.event === "submit" && Number(e.detail.days_late) > 0 && ` (${e.detail.days_late} day${Number(e.detail.days_late) === 1 ? "" : "s"} late)`}
                    {e.device && <span className="text-slate-400"> · {e.device}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}
