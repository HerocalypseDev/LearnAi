"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { autoPoints, checkUpload, daysLate, MAX_FILE_BYTES } from "@/lib/rules";
import { requireUser } from "@/lib/session";
import { bucket, safeFileName, uploadFolder } from "@/lib/storage";
import type { Homework, QuizQuestion, Submission, User } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_ANSWER_LENGTH = 5000;

async function loadHomework(homeworkId: string): Promise<Homework | null> {
  if (!UUID.test(homeworkId)) return null;
  const { data } = await db().from("homeworks").select("*").eq("id", homeworkId).maybeSingle<Homework>();
  return data;
}

/** The student's submission for a homework, created as a draft on first use. */
async function getOrCreateSubmission(student: User, homeworkId: string): Promise<Submission> {
  const { data: inserted, error } = await db()
    .from("submissions")
    .upsert({ homework_id: homeworkId, student_id: student.id }, { onConflict: "homework_id,student_id", ignoreDuplicates: true })
    .select("*")
    .returns<Submission[]>();
  if (error) throw new Error(error.message);
  if (inserted && inserted.length > 0) {
    await logActivity(student.id, "quiz_start", { homework_id: homeworkId });
    return inserted[0];
  }
  const { data, error: readError } = await db()
    .from("submissions")
    .select("*")
    .eq("homework_id", homeworkId)
    .eq("student_id", student.id)
    .single<Submission>();
  if (readError) throw new Error(readError.message);
  return data;
}

const ALREADY_SUBMITTED = "This homework has already been handed in, so it can't be changed.";

export async function saveAnswer(input: {
  homeworkId: string;
  questionId: string;
  answerText?: string;
  selectedOption?: number | null;
  activeMs?: number;
}): Promise<Result> {
  const student = await requireUser("student");
  const homework = await loadHomework(input.homeworkId);
  if (!homework || !UUID.test(input.questionId)) return { ok: false, error: "Homework not found." };

  const { data: question } = await db()
    .from("quiz_questions")
    .select("*")
    .eq("id", input.questionId)
    .eq("homework_id", homework.id)
    .maybeSingle<QuizQuestion>();
  if (!question || (question.version !== "both" && question.version !== student.version)) {
    return { ok: false, error: "Question not found." };
  }

  const submission = await getOrCreateSubmission(student, homework.id);
  if (submission.status === "submitted") return { ok: false, error: ALREADY_SUBMITTED };

  let answerText: string | null = null;
  let selected: number | null = null;
  if (question.type === "mcq") {
    const s = input.selectedOption;
    selected = typeof s === "number" && Number.isInteger(s) && s >= 0 && s < question.options.length ? s : null;
  } else {
    answerText = String(input.answerText ?? "").slice(0, MAX_ANSWER_LENGTH);
  }

  const { error } = await db()
    .from("answers")
    .upsert(
      {
        submission_id: submission.id,
        question_id: question.id,
        answer_text: answerText,
        selected_option: selected,
        auto_points: autoPoints(question, selected),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "submission_id,question_id" },
    );
  if (error) return { ok: false, error: "Couldn't save. Check your internet and try again." };

  const activeMs = Math.max(0, Math.min(Math.round(input.activeMs ?? 0), 60 * 60 * 1000));
  await logActivity(student.id, "answer_change", {
    homework_id: homework.id,
    question_id: question.id,
    active_ms: activeMs,
    length: answerText?.length,
    selected_option: selected,
  });
  return { ok: true };
}

export async function requestUpload(input: {
  homeworkId: string;
  fileName: string;
  sizeBytes: number;
}): Promise<Result<{ signedUrl: string; path: string }>> {
  const student = await requireUser("student");
  const homework = await loadHomework(input.homeworkId);
  if (!homework) return { ok: false, error: "Homework not found." };

  const submission = await getOrCreateSubmission(student, homework.id);
  if (submission.status === "submitted") return { ok: false, error: ALREADY_SUBMITTED };

  const { count } = await db()
    .from("uploads")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id);
  const problem = checkUpload(input.fileName, input.sizeBytes, count ?? 0);
  if (problem) return { ok: false, error: problem };

  const path = `${uploadFolder(student.id, homework.id)}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`;
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) {
    console.error("createSignedUploadUrl failed", error?.message);
    return { ok: false, error: "Couldn't start the upload. Try again." };
  }
  return { ok: true, signedUrl: data.signedUrl, path };
}

export async function confirmUpload(input: {
  homeworkId: string;
  path: string;
  fileName: string;
  fileType: string;
}): Promise<Result> {
  const student = await requireUser("student");
  const homework = await loadHomework(input.homeworkId);
  if (!homework) return { ok: false, error: "Homework not found." };

  const folder = uploadFolder(student.id, homework.id);
  const objectName = input.path.slice(folder.length + 1);
  if (!input.path.startsWith(`${folder}/`) || !objectName || objectName.includes("/")) {
    return { ok: false, error: "Upload not found." };
  }

  const submission = await getOrCreateSubmission(student, homework.id);
  if (submission.status === "submitted") {
    await bucket().remove([input.path]);
    return { ok: false, error: ALREADY_SUBMITTED };
  }

  // Trust the size Supabase stored, not what the browser said.
  const { data: listed } = await bucket().list(folder, { search: objectName, limit: 10 });
  const object = listed?.find((o) => o.name === objectName);
  if (!object) return { ok: false, error: "The upload didn't arrive. Try again." };
  // metadata.size is normally present; if Supabase ever omits it, don't block the upload over it.
  const reported = object.metadata?.size;
  const size = reported === undefined || reported === null ? null : Number(reported);

  const { count } = await db()
    .from("uploads")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id);
  // Check both the name the browser reports and the name actually stored (they share the extension).
  const checkedSize = size ?? 1;
  const problem =
    checkUpload(input.fileName, checkedSize, count ?? 0) ??
    checkUpload(objectName, checkedSize, count ?? 0) ??
    (size !== null && size > MAX_FILE_BYTES ? "File is bigger than 20MB." : null);
  if (problem) {
    await bucket().remove([input.path]);
    return { ok: false, error: problem };
  }

  const { error } = await db().from("uploads").insert({
    submission_id: submission.id,
    file_name: input.fileName.slice(0, 200),
    file_type: input.fileType.slice(0, 100) || null,
    size_bytes: size ?? 0,
    storage_path: input.path,
  });
  if (error) return { ok: false, error: "Couldn't save the upload. Try again." };

  await logActivity(student.id, "upload", { homework_id: homework.id, file_name: input.fileName, size_bytes: size });
  revalidatePath(`/homework/${homework.id}`);
  return { ok: true };
}

export async function removeUpload(uploadId: string): Promise<Result> {
  const student = await requireUser("student");
  if (!UUID.test(uploadId)) return { ok: false, error: "File not found." };

  const { data: upload } = await db()
    .from("uploads")
    .select("id, storage_path, file_name, submissions!inner(id, student_id, status, homework_id)")
    .eq("id", uploadId)
    .maybeSingle<{
      id: string;
      storage_path: string;
      file_name: string;
      submissions: Pick<Submission, "id" | "student_id" | "status" | "homework_id">;
    }>();
  if (!upload || upload.submissions.student_id !== student.id) return { ok: false, error: "File not found." };
  if (upload.submissions.status === "submitted") return { ok: false, error: ALREADY_SUBMITTED };

  await bucket().remove([upload.storage_path]);
  const { error } = await db().from("uploads").delete().eq("id", upload.id);
  if (error) return { ok: false, error: "Couldn't remove the file. Try again." };

  await logActivity(student.id, "upload", {
    homework_id: upload.submissions.homework_id,
    file_name: upload.file_name,
    removed: true,
  });
  revalidatePath(`/homework/${upload.submissions.homework_id}`);
  return { ok: true };
}

export async function submitHomework(homeworkId: string): Promise<Result> {
  const student = await requireUser("student");
  const homework = await loadHomework(homeworkId);
  if (!homework) return { ok: false, error: "Homework not found." };

  const submission = await getOrCreateSubmission(student, homework.id);
  if (submission.status === "submitted") return { ok: false, error: ALREADY_SUBMITTED };

  const now = new Date();
  const late = daysLate(new Date(homework.due_at), now);
  // Only flip a draft, so a double-click can't submit twice.
  const { data: updated, error } = await db()
    .from("submissions")
    .update({ status: "submitted", submitted_at: now.toISOString(), days_late: late })
    .eq("id", submission.id)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: "Couldn't hand in. Check your internet and try again." };
  if (!updated?.length) return { ok: false, error: ALREADY_SUBMITTED };

  await logActivity(student.id, "submit", { homework_id: homework.id, days_late: late });
  revalidatePath(`/homework/${homework.id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
