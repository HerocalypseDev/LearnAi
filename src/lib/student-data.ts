import "server-only";
import { db } from "./db";
import { homeworkStatus, isGradeVisible, type HomeworkStatus } from "./rules";
import type { Grade, Homework, Submission } from "./types";

export interface StudentHomework {
  homework: Homework;
  submission: Submission | null;
  /** Only set when the child is allowed to see it (deadline passed and released). */
  grade: Grade | null;
  status: HomeworkStatus;
}

/** Homework columns a student's pages may use: never the teacher's marking notes. */
export const STUDENT_HOMEWORK_COLUMNS = "id, week, title, due_at, instructions_a, instructions_b, max_points, quiz_points, task_points";

export async function loadStudentHomework(studentId: string, homeworkId?: string): Promise<StudentHomework[]> {
  let hwQuery = db().from("homeworks").select(STUDENT_HOMEWORK_COLUMNS).order("due_at");
  if (homeworkId) hwQuery = hwQuery.eq("id", homeworkId);

  const [{ data: homeworks, error: hwError }, { data: submissions, error: subError }] = await Promise.all([
    hwQuery.returns<Homework[]>(),
    db().from("submissions").select("*").eq("student_id", studentId).returns<Submission[]>(),
  ]);
  if (hwError) throw new Error(hwError.message);
  if (subError) throw new Error(subError.message);

  const subIds = (submissions ?? []).map((s) => s.id);
  const { data: grades, error: gradeError } = subIds.length
    ? await db().from("grades").select("*").in("submission_id", subIds).returns<Grade[]>()
    : { data: [] as Grade[], error: null };
  if (gradeError) throw new Error(gradeError.message);

  const now = new Date();
  return (homeworks ?? []).map((homework) => {
    const submission = submissions?.find((s) => s.homework_id === homework.id) ?? null;
    const rawGrade = submission ? grades?.find((g) => g.submission_id === submission.id) ?? null : null;
    const dueAt = new Date(homework.due_at);
    const grade =
      rawGrade && isGradeVisible(dueAt, rawGrade.released_at ? new Date(rawGrade.released_at) : null, now)
        ? rawGrade
        : null;
    return { homework, submission, grade, status: homeworkStatus(dueAt, submission, now) };
  });
}

/** "James" / "Peter" for labelling versions A and B in the admin screens. */
export async function versionNames(): Promise<{ A: string; B: string }> {
  const { data } = await db().from("users").select("full_name, version").eq("role", "student");
  const name = (v: string) =>
    (data ?? []).filter((u) => u.version === v).map((u) => u.full_name).join(", ") || `Version ${v}`;
  return { A: name("A"), B: name("B") };
}
