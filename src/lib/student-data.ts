import "server-only";
import { db } from "./db";
import { timed } from "./perf";
import { homeworkStatus, isGradeVisible, type HomeworkStatus } from "./rules";
import type { Grade, Homework, Submission } from "./types";

export type StudentSubmission = Pick<Submission, "id" | "homework_id" | "status" | "submitted_at" | "days_late">;
export type StudentGrade = Pick<Grade, "quiz_points" | "task_points" | "late_penalty" | "final_points" | "comment" | "released_at">;

export interface StudentHomework {
  homework: Homework;
  submission: StudentSubmission | null;
  /** Only set when the child is allowed to see it (deadline passed and released). */
  grade: StudentGrade | null;
  /** Whether the teacher released the result (task files lock then), even before the deadline. Never the marks. */
  released: boolean;
  status: HomeworkStatus;
}

/** Homework columns a student's pages may use: never the teacher's marking notes. */
export const STUDENT_HOMEWORK_COLUMNS = "id, week, title, due_at, instructions_a, instructions_b, max_points, quiz_points, task_points";

/** Submission columns for a student's own pages, with its grade embedded (grades.submission_id is unique: one or none). */
export const STUDENT_SUBMISSION_COLUMNS =
  "id, homework_id, status, submitted_at, days_late, grades(quiz_points, task_points, late_penalty, final_points, comment, released_at)";

type SubmissionWithGrade = StudentSubmission & { grades: StudentGrade | StudentGrade[] | null };

/** PostgREST returns a one-to-one embed as an object; older versions return a one-item array. */
export function embeddedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Pairs each homework with the student's submission and grade. The grade is dropped here, on the server, unless the
 * deadline has passed and it was released (isGradeVisible): an unreleased mark never leaves this function.
 */
export function joinStudentHomework(homeworks: Homework[], submissions: SubmissionWithGrade[], now: Date): StudentHomework[] {
  return homeworks.map((homework) => {
    const row = submissions.find((s) => s.homework_id === homework.id) ?? null;
    const rawGrade = row ? embeddedOne(row.grades) : null;
    const submission: StudentSubmission | null = row
      ? { id: row.id, homework_id: row.homework_id, status: row.status, submitted_at: row.submitted_at, days_late: row.days_late }
      : null;
    const dueAt = new Date(homework.due_at);
    const releasedAt = rawGrade?.released_at ? new Date(rawGrade.released_at) : null;
    const grade = rawGrade && isGradeVisible(dueAt, releasedAt, now) ? rawGrade : null;
    return { homework, submission, grade, released: releasedAt !== null, status: homeworkStatus(dueAt, submission, now) };
  });
}

/** One wave: the homework list and the student's own submissions with their grades, side by side. */
export async function loadStudentHomework(studentId: string, homeworkId?: string): Promise<StudentHomework[]> {
  let hwQuery = db().from("homeworks").select(STUDENT_HOMEWORK_COLUMNS).order("due_at");
  if (homeworkId) hwQuery = hwQuery.eq("id", homeworkId);
  let subQuery = db().from("submissions").select(STUDENT_SUBMISSION_COLUMNS).eq("student_id", studentId);
  if (homeworkId) subQuery = subQuery.eq("homework_id", homeworkId);

  const [{ data: homeworks, error: hwError }, { data: submissions, error: subError }] = await Promise.all([
    timed("student:homeworks", () => hwQuery.returns<Homework[]>()),
    timed("student:submissions", () => subQuery.returns<SubmissionWithGrade[]>()),
  ]);
  if (hwError) throw new Error(hwError.message);
  if (subError) throw new Error(subError.message);
  return joinStudentHomework(homeworks ?? [], submissions ?? [], new Date());
}

/** "James" / "Peter" for labelling versions A and B in the admin screens. */
export async function versionNames(): Promise<{ A: string; B: string }> {
  const { data } = await db().from("users").select("full_name, version").eq("role", "student");
  const name = (v: string) =>
    (data ?? []).filter((u) => u.version === v).map((u) => u.full_name).join(", ") || `Version ${v}`;
  return { A: name("A"), B: name("B") };
}
