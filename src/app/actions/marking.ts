"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { loadMarking } from "@/lib/marking";
import { autoPoints, clampPoints, computeGrade } from "@/lib/rules";
import { requireUser } from "@/lib/session";

export interface MarkState {
  ok?: string;
  error?: string;
}

/** Save marks. intent: "save" keeps the release state, "release" shows it to the child, "unrelease" hides it again. */
export async function saveMarks(_prev: MarkState, formData: FormData): Promise<MarkState> {
  await requireUser("admin");
  const homeworkId = String(formData.get("homework_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const intent = String(formData.get("intent") ?? "save");

  const data = await loadMarking(homeworkId, studentId);
  if (!data?.submission) return { error: "Nothing to mark: this homework hasn't been started." };
  if (data.submission.status !== "submitted") return { error: "This homework hasn't been handed in yet." };
  const { submission, homework, questions, answers, penalty } = data;

  let quizPoints = 0;
  const answerRows = questions.map((q) => {
    const existing = answers[q.id];
    const auto = autoPoints(q, existing?.selected_option ?? null);
    const manual = q.type === "short" ? clampPoints(formData.get(`q_${q.id}`), q.points) : null;
    quizPoints += auto ?? manual ?? 0;
    return {
      submission_id: submission.id,
      question_id: q.id,
      answer_text: existing?.answer_text ?? null,
      selected_option: existing?.selected_option ?? null,
      auto_points: auto,
      manual_points: manual,
      updated_at: existing?.updated_at ?? new Date().toISOString(),
    };
  });
  quizPoints = Math.min(quizPoints, homework.quiz_points);

  if (answerRows.length) {
    const { error } = await db().from("answers").upsert(answerRows, { onConflict: "submission_id,question_id" });
    if (error) return { error: error.message };
  }

  const taskPoints = clampPoints(formData.get("task_points"), homework.task_points);
  const { late_penalty, final_points } = computeGrade({
    quizPoints,
    taskPoints,
    daysLate: submission.days_late,
    perDay: penalty.perDay,
    cap: penalty.cap,
  });
  const releasedAt =
    intent === "release" ? new Date().toISOString() : intent === "unrelease" ? null : (data.grade?.released_at ?? null);

  const { error } = await db().from("grades").upsert(
    {
      submission_id: submission.id,
      quiz_points: quizPoints,
      task_points: taskPoints,
      late_penalty,
      final_points,
      comment: String(formData.get("comment") ?? "").trim() || null,
      released_at: releasedAt,
    },
    { onConflict: "submission_id" },
  );
  if (error) return { error: error.message };

  revalidatePath(`/admin/homework/${homeworkId}`);
  revalidatePath("/admin");
  const verdict = intent === "release" ? "Saved and released." : intent === "unrelease" ? "Hidden from the child again." : "Saved (not released).";
  return { ok: `${verdict} Final score ${final_points}/${homework.max_points}.` };
}
