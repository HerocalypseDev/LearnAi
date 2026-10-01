"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { autoPoints, checkStoredUpload, checkUpload, daysLate, hasHandInContent, MAX_FILES } from "@/lib/rules";
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

/**
 * The student's submission for a homework, created as a draft on first use.
 *
 * Race: the first open of a homework can arrive twice at once (two tabs, a double tap). The unique
 * (homework_id, student_id) index guarantees one row; `ON CONFLICT DO NOTHING` makes the loser's insert a
 * no-op that returns nothing (Postgres waits for the winner to commit first), and the loser then reads the
 * winner's row. A plain "upsert and return" can't tell winner from loser, and only the winner may log quiz_start.
 */
async function getOrCreateSubmission(student: User, homeworkId: string): Promise<Submission> {
  const find = () =>
    db().from("submissions").select("*").eq("homework_id", homeworkId).eq("student_id", student.id).maybeSingle<Submission>();

  const { data: existing, error: findError } = await find();
  if (findError) throw new Error(findError.message);
  if (existing) return existing;

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
  const { data: winner, error: readError } = await find();
  if (readError || !winner) throw new Error(readError?.message ?? "Could not open the homework. Try again.");
  return winner;
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
    if (!Array.isArray(question.options) || question.options.length < 2) {
      return { ok: false, error: "This question isn't ready yet. Tell your teacher." };
    }
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

  // Confirming the same file twice (double tap, retry) is fine and must never delete the stored file.
  const { data: recorded } = await db().from("uploads").select("id").eq("storage_path", input.path).maybeSingle();
  if (recorded) return { ok: true };

  // Trust the size the storage service holds, not what the browser said. Its listing can lag a moment
  // behind the upload, so look a few times; if the size is still unknown, ask the child to retry
  // (the file stays in storage for that retry) instead of guessing.
  let object: { name: string; metadata?: { size?: unknown } | null } | undefined;
  let size: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: listed } = await bucket().list(folder, { search: objectName, limit: 10 });
    object = listed?.find((o) => o.name === objectName);
    const reported = object?.metadata?.size;
    size = reported === undefined || reported === null ? null : Number(reported);
    if (object && size !== null && Number.isFinite(size)) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
  }
  if (!object) return { ok: false, error: "The upload didn't arrive. Try again." };

  const { count } = await db()
    .from("uploads")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id);
  const verdict = checkStoredUpload(input.fileName, objectName, size, count ?? 0);
  if (verdict) {
    if (!verdict.retryable) await bucket().remove([input.path]);
    return { ok: false, error: verdict.problem };
  }
  const storedSize = size as number;

  // The database is the hard gate: a trigger (supabase/migrations/002_integrity.sql) locks the submission,
  // and refuses the row if it is handed in or already has MAX_FILES files, even for parallel requests.
  const { error } = await db().from("uploads").insert({
    submission_id: submission.id,
    file_name: input.fileName.slice(0, 200),
    file_type: input.fileType.slice(0, 100) || null,
    size_bytes: storedSize,
    storage_path: input.path,
  });
  if (error) {
    if (error.code === "23505") return { ok: true }; // this exact file was already recorded (double confirm)
    await bucket().remove([input.path]); // never leave a stored file that has no row
    if (/already_submitted/.test(error.message)) return { ok: false, error: ALREADY_SUBMITTED };
    if (/upload_limit/.test(error.message)) return { ok: false, error: `You can attach up to ${MAX_FILES} files.` };
    console.error("confirmUpload insert failed", error.message);
    return { ok: false, error: "Couldn't save the upload. Try again." };
  }

  await logActivity(student.id, "upload", { homework_id: homework.id, file_name: input.fileName, size_bytes: storedSize });
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

  // Row first: if the file can't be deleted from storage afterwards it is just an unreferenced leftover,
  // whereas the other order could leave a listed file whose content is gone.
  const { error } = await db().from("uploads").delete().eq("id", upload.id);
  if (error) return { ok: false, error: "Couldn't remove the file. Try again." };
  const { error: storageError } = await bucket().remove([upload.storage_path]);
  if (storageError) console.error("removeUpload: storage delete failed", upload.storage_path, storageError.message);

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

  const [{ data: answerRows }, { count: fileCount }] = await Promise.all([
    db().from("answers").select("selected_option, answer_text").eq("submission_id", submission.id),
    db().from("uploads").select("id", { count: "exact", head: true }).eq("submission_id", submission.id),
  ]);
  if (!hasHandInContent(answerRows ?? [], fileCount ?? 0)) {
    return { ok: false, error: "Add your quiz answers or a file before handing in." };
  }

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
