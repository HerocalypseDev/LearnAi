"use client";

import { useActionState, useState } from "react";
import { saveMarks, type MarkState } from "@/app/actions/marking";
import { Spinner } from "@/components/spinner";
import { buttonClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";

const pointsInputClass =
  "w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
import { clampPoints, computeGrade } from "@/lib/rules";

export interface MarkQuestion {
  id: string;
  type: "mcq" | "short";
  prompt: string;
  options: string[];
  correct_option: number | null;
  points: number;
  answer_text: string | null;
  selected_option: number | null;
  /** Auto points for multiple choice, saved manual points for short answers. */
  earned: number | null;
  seconds: number | null;
}

export function MarkForm({
  homeworkId,
  studentId,
  questions,
  quizMax,
  taskMax,
  maxPoints,
  daysLate,
  penalty,
  initialTask,
  initialComment,
  released,
  deadlinePassed,
}: {
  homeworkId: string;
  studentId: string;
  questions: MarkQuestion[];
  quizMax: number;
  taskMax: number;
  maxPoints: number;
  daysLate: number;
  penalty: { perDay: number; cap: number };
  initialTask: number | null;
  initialComment: string;
  released: boolean;
  deadlinePassed: boolean;
}) {
  const [state, action, pending] = useActionState<MarkState, FormData>(saveMarks, {});
  const [manual, setManual] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.filter((q) => q.type === "short").map((q) => [q.id, q.earned?.toString() ?? ""])),
  );
  const [task, setTask] = useState(initialTask?.toString() ?? "");

  const quiz = Math.min(
    questions.reduce((sum, q) => sum + (q.type === "mcq" ? (q.earned ?? 0) : clampPoints(manual[q.id], q.points)), 0),
    quizMax,
  );
  const taskPoints = clampPoints(task, taskMax);
  const { late_penalty, final_points } = computeGrade({ quizPoints: quiz, taskPoints, daysLate, ...penalty });

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="homework_id" value={homeworkId} />
      <input type="hidden" name="student_id" value={studentId} />

      <section className="space-y-3">
        {questions.length === 0 && <p className="text-sm text-slate-500">No quiz questions for this version.</p>}
        {(["mcq", "short"] as const).map((type) => {
          const group = questions.filter((q) => q.type === type);
          if (group.length === 0) return null;
          const subtotal = group.reduce((sum, q) => sum + (type === "mcq" ? (q.earned ?? 0) : clampPoints(manual[q.id], q.points)), 0);
          const max = group.reduce((sum, q) => sum + q.points, 0);
          return (
            <div key={type} className="space-y-3">
              <h2 className="flex items-baseline justify-between text-lg font-bold">
                {type === "mcq" ? "1 · Quiz" : "2 · Short answer"}
                <span className="text-sm font-semibold text-slate-600">
                  {subtotal}/{max}
                </span>
              </h2>
              {group.map((q, i) => (
                <div key={q.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="font-medium">
                      <span className="mr-1 text-indigo-600">{i + 1}.</span>
                      <span className="whitespace-pre-wrap">{q.prompt}</span>
                    </p>
                    <span className="shrink-0 text-xs text-slate-500">
                      {q.seconds !== null && `${Math.max(1, Math.round(q.seconds / 60))} min · `}
                      {q.points} pts
                    </span>
                  </div>
                  {q.type === "mcq" ? (
                    <>
                      <ul className="space-y-1 text-sm">
                        {q.options.map((o, oi) => {
                          const chosen = q.selected_option === oi;
                          const correct = q.correct_option === oi;
                          return (
                            <li
                              key={oi}
                              className={`rounded-lg px-3 py-1.5 ${
                                chosen && correct
                                  ? "bg-emerald-100 font-semibold text-emerald-900"
                                  : chosen
                                    ? "bg-red-100 font-semibold text-red-900"
                                    : correct
                                      ? "bg-emerald-50 text-emerald-800"
                                      : "text-slate-600"
                              }`}
                            >
                              {chosen ? "➜ " : ""}
                              {o}
                              {correct && " ✓"}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-2 text-sm font-semibold">
                        {q.selected_option === null ? "Not answered · " : ""}Auto-marked: {q.earned ?? 0}/{q.points}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
                        {q.answer_text?.trim() || <span className="text-slate-400">No answer</span>}
                      </p>
                      <label className="mt-2 flex items-center gap-2 text-sm font-medium">
                        Points
                        <input
                          name={`q_${q.id}`}
                          type="number"
                          min={0}
                          max={q.points}
                          value={manual[q.id] ?? ""}
                          onChange={(e) => setManual({ ...manual, [q.id]: e.target.value })}
                          className={pointsInputClass}
                        />
                        <span className="text-slate-500">/ {q.points}</span>
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-bold">3 · Task (their uploaded file, above) &amp; comment</h2>
        <label className="flex items-center gap-2 text-sm font-medium">
          Task points
          <input
            name="task_points"
            type="number"
            min={0}
            max={taskMax}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            className={pointsInputClass}
          />
          <span className="text-slate-500">/ {taskMax}</span>
        </label>
        <label className="block text-sm font-medium">
          Comment for the child
          <textarea name="comment" defaultValue={initialComment} rows={4} className={`mt-1 ${inputClass}`} />
        </label>
      </section>

      <section className="sticky bottom-0 space-y-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
        <dl className="grid grid-cols-4 gap-2 text-center text-sm">
          <div>
            <dt className="text-slate-500">Quiz</dt>
            <dd className="font-semibold">
              {quiz}/{quizMax}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Task</dt>
            <dd className="font-semibold">
              {taskPoints}/{taskMax}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Late</dt>
            <dd className={`font-semibold ${late_penalty ? "text-red-700" : ""}`}>{late_penalty ? `−${late_penalty}` : "0"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Final</dt>
            <dd className="text-lg font-bold text-indigo-700">
              {final_points}/{maxPoints}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <button name="intent" value="save" disabled={pending} className={secondaryButtonClass}>
            Save
          </button>
          {released ? (
            <>
              <button name="intent" value="release" disabled={pending} className={buttonClass}>
                Save &amp; keep released
              </button>
              <button name="intent" value="unrelease" disabled={pending} className={dangerButtonClass}>
                Hide from child
              </button>
            </>
          ) : (
            <button name="intent" value="release" disabled={pending} className={buttonClass}>
              Save &amp; release
            </button>
          )}
          {pending && (
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <Spinner /> Saving…
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {released ? "Released. " : "Not released yet. "}
          {deadlinePassed
            ? "The deadline has passed, so a released result shows to the child straight away."
            : "Even once released, the child only sees it after the deadline."}
        </p>
        {state.ok && <p className="text-sm font-medium text-emerald-700">{state.ok}</p>}
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </section>
    </form>
  );
}
