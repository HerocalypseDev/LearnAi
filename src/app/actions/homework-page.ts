"use server";

import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { signedLinks } from "@/lib/storage";
import type { Answer, Settings, StudentQuestion, Upload, Submission, Homework, Grade, User } from "@/lib/types";
import { homeworkStatus, isGradeVisible } from "@/lib/rules";

export interface HomeworkPageData {
  homework: Homework;
  student: User;
  questions: StudentQuestion[];
  uploads: Array<{ id: string; file_name: string; file_type: string | null; size_bytes: number; link: string | null }>;
  answers: Answer[];
  submission: Submission | null;
  grade: Grade | null;
  settings: Settings | null;
  status: import("@/lib/rules").HomeworkStatus;
}

export async function loadHomeworkPage(homeworkId: string): Promise<HomeworkPageData | null> {
  const student = await requireUser("student");

  const { data: homework } = await db()
    .from("homeworks")
    .select("*")
    .eq("id", homeworkId)
    .maybeSingle<Homework>();
  if (!homework) return null;

  const [
    { data: questions },
    { data: submission },
    { data: answers },
    { data: uploads },
    { data: settings },
  ] = await Promise.all([
    db()
      .from("quiz_questions")
      .select("id, homework_id, type, question_text, options, points, version")
      .eq("homework_id", homeworkId)
      .or(`version.eq.${student.version},version.eq.both`)
      .order("display_order")
      .returns<StudentQuestion[]>(),
    db()
      .from("submissions")
      .select("*")
      .eq("homework_id", homeworkId)
      .eq("student_id", student.id)
      .maybeSingle<Submission>(),
    db()
      .from("answers")
      .select("*")
      .eq("homework_id", homeworkId)
      .eq("student_id", student.id)
      .returns<Answer[]>(),
    db()
      .from("uploads")
      .select("*")
      .eq("homework_id", homeworkId)
      .eq("student_id", student.id)
      .order("uploaded_at")
      .returns<Upload[]>(),
    db().from("settings").select("*").maybeSingle<Settings>(),
  ]);

  const { data: grade } = submission
    ? await db().from("grades").select("*").eq("submission_id", submission.id).maybeSingle<Grade>()
    : { data: null };

  const now = new Date();
  const dueAt = new Date(homework.due_at);
  const visibleGrade =
    grade && isGradeVisible(dueAt, grade.released_at ? new Date(grade.released_at) : null, now) ? grade : null;

  const status = homeworkStatus(dueAt, submission ?? null, now);

  const links = await signedLinks((uploads ?? []).map((u) => u.storage_path));
  const uploadViews = (uploads ?? []).map((u) => ({
    id: u.id,
    file_name: u.file_name,
    file_type: u.file_type,
    size_bytes: u.size_bytes,
    link: links[u.storage_path] ?? null,
  }));

  return {
    homework,
    student,
    questions: questions ?? [],
    uploads: uploadViews,
    answers: answers ?? [],
    submission: submission ?? null,
    grade: visibleGrade,
    settings: settings ?? null,
    status,
  };
}
