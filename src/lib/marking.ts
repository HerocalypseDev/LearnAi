import "server-only";
import { db } from "./db";
import { autoPoints, DEFAULT_PENALTY } from "./rules";
import type { Answer, Grade, Homework, QuizQuestion, Settings, Submission, Upload, User } from "./types";

export interface MarkingData {
  homework: Homework;
  student: User;
  submission: Submission | null;
  questions: QuizQuestion[];
  answers: Record<string, Answer>;
  uploads: Upload[];
  grade: Grade | null;
  penalty: { perDay: number; cap: number };
  /** Seconds spent per question, from the activity log. */
  secondsPerQuestion: Record<string, number>;
  timeline: { event: string; created_at: string; detail: Record<string, unknown>; device: string | null }[];
}

export async function loadMarking(homeworkId: string, studentId: string): Promise<MarkingData | null> {
  const [{ data: homework }, { data: student }, { data: submission }, { data: settings }] = await Promise.all([
    db().from("homeworks").select("*").eq("id", homeworkId).maybeSingle<Homework>(),
    db().from("users").select("*").eq("id", studentId).eq("role", "student").maybeSingle<User>(),
    db().from("submissions").select("*").eq("homework_id", homeworkId).eq("student_id", studentId).maybeSingle<Submission>(),
    db().from("settings").select("late_penalty_per_day, late_penalty_cap").eq("id", 1).maybeSingle<Settings>(),
  ]);
  if (!homework || !student) return null;

  const [{ data: questions }, { data: answers }, { data: uploads }, { data: grade }, { data: activity }] = await Promise.all([
    db()
      .from("quiz_questions")
      .select("*")
      .eq("homework_id", homeworkId)
      .in("version", ["both", student.version ?? "A"])
      .order("position")
      .order("id")
      .returns<QuizQuestion[]>(),
    submission
      ? db().from("answers").select("*").eq("submission_id", submission.id).returns<Answer[]>()
      : Promise.resolve({ data: [] as Answer[] }),
    submission
      ? db().from("uploads").select("*").eq("submission_id", submission.id).order("uploaded_at").returns<Upload[]>()
      : Promise.resolve({ data: [] as Upload[] }),
    submission
      ? db().from("grades").select("*").eq("submission_id", submission.id).maybeSingle<Grade>()
      : Promise.resolve({ data: null }),
    db()
      .from("activity_log")
      .select("event, created_at, detail, device")
      .eq("user_id", studentId)
      .eq("detail->>homework_id", homeworkId)
      .order("created_at")
      .returns<MarkingData["timeline"]>(),
  ]);

  const byQuestion: Record<string, Answer> = {};
  for (const a of answers ?? []) byQuestion[a.question_id] = a;

  const ms: Record<string, number> = {};
  for (const e of activity ?? []) {
    const q = e.detail.question_id;
    if (e.event === "answer_change" && typeof q === "string") ms[q] = (ms[q] ?? 0) + Number(e.detail.active_ms ?? 0);
  }
  const secondsPerQuestion = Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, Math.round(v / 1000)]));

  return {
    homework,
    student,
    submission,
    questions: questions ?? [],
    answers: byQuestion,
    uploads: uploads ?? [],
    grade: grade ?? null,
    penalty: {
      perDay: settings?.late_penalty_per_day ?? DEFAULT_PENALTY.perDay,
      cap: settings?.late_penalty_cap ?? DEFAULT_PENALTY.cap,
    },
    secondsPerQuestion,
    timeline: activity ?? [],
  };
}

/** Points a question currently earns: multiple choice re-marked against the current correct answer. */
export function questionPoints(q: QuizQuestion, a: Answer | undefined): number | null {
  if (q.type === "mcq") return autoPoints(q, a?.selected_option ?? null);
  return a?.manual_points ?? null;
}

export interface SubmissionSummary {
  student: Pick<User, "id" | "full_name" | "version">;
  homework: Pick<Homework, "id" | "title" | "week" | "due_at">;
  submission: Pick<Submission, "id" | "status" | "submitted_at" | "days_late"> | null;
  grade: Pick<Grade, "final_points" | "released_at" | "marked_by"> | null;
}

/** Every student x homework pair, optionally for one homework. */
export async function loadSubmissionSummaries(homeworkId?: string): Promise<SubmissionSummary[]> {
  let hw = db().from("homeworks").select("id, title, week, due_at").order("due_at");
  if (homeworkId) hw = hw.eq("id", homeworkId);
  let subs = db().from("submissions").select("id, homework_id, student_id, status, submitted_at, days_late");
  if (homeworkId) subs = subs.eq("homework_id", homeworkId);

  const [{ data: homeworks }, { data: students }, { data: submissions }, { data: grades }] = await Promise.all([
    hw.returns<SubmissionSummary["homework"][]>(),
    db().from("users").select("id, full_name, version").eq("role", "student").order("full_name").returns<SubmissionSummary["student"][]>(),
    subs.returns<(NonNullable<SubmissionSummary["submission"]> & { homework_id: string; student_id: string })[]>(),
    // select("*") so marked_by is included once the Jarvis migration has run, without breaking before it.
    db().from("grades").select("*").returns<(NonNullable<SubmissionSummary["grade"]> & { submission_id: string })[]>(),
  ]);

  const out: SubmissionSummary[] = [];
  for (const homework of homeworks ?? []) {
    for (const student of students ?? []) {
      const submission = submissions?.find((s) => s.homework_id === homework.id && s.student_id === student.id) ?? null;
      const grade = submission ? (grades?.find((g) => g.submission_id === submission.id) ?? null) : null;
      out.push({ student, homework, submission, grade });
    }
  }
  return out;
}
