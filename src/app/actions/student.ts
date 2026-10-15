"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { timed } from "@/lib/perf";
import { autoPoints, checkStoredUpload, checkUpload, computeGrade, daysLate, DEFAULT_PENALTY, hasHandInContent, lateDaysAfterUpload, MAX_FILES } from "@/lib/rules";
import { requireUser } from "@/lib/session";
import { bucket, safeFileName, uploadFolder } from "@/lib/storage";
import { isWritingFileName, nextTextFileName, textProblem } from "@/lib/task-text";
import type { Grade, Homework, QuizQuestion, Settings, Submission, User, Upload } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Names of this submission's files, for allocating the next Writing-N.txt. */
async function uploadNames(submissionId: string): Promise<{ id: string; file_name: string }[]> {
  const { data } = await db().from("uploads").select("id, file_name").eq("submission_id", submissionId);
  return data ?? [];
}

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_ANSWER_LENGTH = 5000;

async function loadHomework(homeworkId: string): Promise<Homework | null> {
  if (!UUID.test(homeworkId)) return null;
  const { data } = await timed("action:homework", () => db().from("homeworks").select("*").eq("id", homeworkId).maybeSingle<Homework>());
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
    timed("action:submission", () =>
      db().from("submissions").select("*").eq("homework_id", homeworkId).eq("student_id", student.id).maybeSingle<Submission>(),
    );

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

/**
 * Marks saved (not yet released) were worked out with the old days late. Keep their penalty and final score true
 * so the teacher's overview and Jarvis don't show a stale number; releasing recomputes everything anyway.
 */
async function refreshSavedPenalty(submissionId: string, days: number) {
  const [{ data: grade }, { data: settings }] = await Promise.all([
    db().from("grades").select("quiz_points, task_points, released_at").eq("submission_id", submissionId).maybeSingle<Pick<Grade, "quiz_points" | "task_points" | "released_at">>(),
    db().from("settings").select("late_penalty_per_day, late_penalty_cap").eq("id", 1).maybeSingle<Settings>(),
  ]);
  if (!grade || grade.released_at) return;
  const { late_penalty, final_points } = computeGrade({
    quizPoints: grade.quiz_points,
    taskPoints: grade.task_points,
    daysLate: days,
    perDay: settings?.late_penalty_per_day ?? DEFAULT_PENALTY.perDay,
    cap: settings?.late_penalty_cap ?? DEFAULT_PENALTY.cap,
  });
  const { error } = await db().from("grades").update({ late_penalty, final_points }).eq("submission_id", submissionId).is("released_at", null);
  if (error) console.error("refreshSavedPenalty failed", error.message);
}

const ALREADY_SUBMITTED = "Your quiz has already been handed in, so the answers can't be changed.";
const TASK_LOCKED = "Your teacher has released your result, so task files can't be changed any more.";

/**
 * Quiz and short answers lock at hand-in, but task files stay open (they take time) until the teacher
 * releases the result. The database trigger enforces the same rule for parallel requests.
 */
async function taskLocked(submissionId: string): Promise<boolean> {
  const { data } = await db().from("grades").select("released_at").eq("submission_id", submissionId).maybeSingle<{ released_at: string | null }>();
  return !!data?.released_at;
}

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

  const { data: question } = await timed("autosave:question", () =>
    db().from("quiz_questions").select("*").eq("id", input.questionId).eq("homework_id", homework.id).maybeSingle<QuizQuestion>(),
  );
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

  const { error } = await timed("autosave:upsert_answer", () =>
    db()
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
      ),
  );
  if (error) {
    // The database refuses answer changes once handed in (another tab may have handed in a moment ago).
    if (/already_submitted/.test(error.message)) return { ok: false, error: ALREADY_SUBMITTED };
    return { ok: false, error: "Couldn't save. Check your internet and try again." };
  }

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
  if (await taskLocked(submission.id)) return { ok: false, error: TASK_LOCKED };

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
  /** A written piece (Writing-N.txt) being edited: the new file replaces this upload's content. */
  replaceUploadId?: string;
}): Promise<Result> {
  const student = await requireUser("student");
  const homework = await loadHomework(String(input.homeworkId ?? ""));
  if (!homework) return { ok: false, error: "Homework not found." };
  const path = String(input.path ?? "");
  const fileName = String(input.fileName ?? "").slice(0, 200);
  const fileType = String(input.fileType ?? "").slice(0, 100) || null;

  const folder = uploadFolder(student.id, homework.id);
  const objectName = path.slice(folder.length + 1);
  if (!path.startsWith(`${folder}/`) || !objectName || objectName.includes("/")) {
    return { ok: false, error: "Upload not found." };
  }

  const submission = await getOrCreateSubmission(student, homework.id);

  // Confirming the same file twice (double tap, retry) is fine and must never delete the stored file,
  // so this comes before anything below that may remove the object.
  const { data: recorded } = await db().from("uploads").select("id").eq("storage_path", path).maybeSingle();
  if (recorded) return { ok: true };

  if (await taskLocked(submission.id)) {
    await bucket().remove([path]);
    return { ok: false, error: TASK_LOCKED };
  }

  // Editing a written piece: it must be one of this submission's Writing-N.txt files.
  let replacing: Pick<Upload, "id" | "file_name" | "storage_path"> | null = null;
  if (input.replaceUploadId !== undefined) {
    const { data } = UUID.test(String(input.replaceUploadId))
      ? await db()
          .from("uploads")
          .select("id, file_name, storage_path")
          .eq("id", String(input.replaceUploadId))
          .eq("submission_id", submission.id)
          .maybeSingle<Pick<Upload, "id" | "file_name" | "storage_path">>()
      : { data: null };
    if (!data || !isWritingFileName(data.file_name)) {
      await bucket().remove([path]);
      return { ok: false, error: "That piece of writing wasn't found. Close the editor and try again." };
    }
    replacing = data;
  }

  // Trust the size the storage service holds, not what the browser said. Its listing can lag a moment
  // behind the upload, so look a few times; if the size is still unknown, ask the child to retry
  // (the file stays in storage for that retry) instead of guessing.
  let object: { name: string; metadata?: { size?: unknown } | null } | undefined;
  let size: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: listed } = await timed("upload:storage_list", () => bucket().list(folder, { search: objectName, limit: 10 }));
    object = listed?.find((o) => o.name === objectName);
    const reported = object?.metadata?.size;
    size = reported === undefined || reported === null ? null : Number(reported);
    if (object && size !== null && Number.isFinite(size)) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
  }
  if (!object) return { ok: false, error: "The upload didn't arrive. Try again." };

  const existing = await uploadNames(submission.id);
  // A replacement doesn't add a file, so it doesn't count against the limit.
  const verdict = checkStoredUpload(fileName, objectName, size, replacing ? 0 : existing.length);
  if (verdict) {
    if (!verdict.retryable) await bucket().remove([path]);
    return { ok: false, error: verdict.problem };
  }
  const storedSize = size as number;

  let error: { code?: string; message: string } | null;
  let savedName = fileName;
  if (replacing) {
    // Point the row at the new file, then drop the old one. The upload trigger (004) refuses this once released.
    // Matching the old path too means two edits saved at once can't both win: the loser changes nothing.
    savedName = replacing.file_name;
    const res = await db()
      .from("uploads")
      .update({ storage_path: path, size_bytes: storedSize, file_type: fileType, uploaded_at: new Date().toISOString() })
      .eq("id", replacing.id)
      .eq("storage_path", replacing.storage_path)
      .select("id");
    error = res.error;
    if (!error && !res.data?.length) {
      await bucket().remove([path]);
      return { ok: false, error: "This writing was changed somewhere else. Close the editor and open it again." };
    }
  } else {
    // Two written pieces started at once (two tabs) could both be offered the same Writing-N name: re-number here.
    if (isWritingFileName(savedName) && existing.some((u) => u.file_name === savedName)) savedName = nextTextFileName(existing);
    // The database is the hard gate: a trigger (supabase/schema.sql, enforce_upload_rules) locks the submission,
    // and refuses the row if the result was released or it already has MAX_FILES files, even for parallel requests.
    ({ error } = await timed("upload:insert", () =>
      db().from("uploads").insert({
        submission_id: submission.id,
        file_name: savedName,
        file_type: fileType,
        size_bytes: storedSize,
        storage_path: path,
      }),
    ));
  }
  if (error) {
    if (error.code === "23505") return { ok: true }; // this exact file was already recorded (double confirm)
    await bucket().remove([path]); // never leave a stored file that has no row
    if (/task_locked/.test(error.message)) return { ok: false, error: TASK_LOCKED };
    if (/already_submitted/.test(error.message)) {
      // The older upload trigger (002) is still installed: the teacher needs to run migration 004.
      console.error("confirmUpload: old upload trigger installed; run supabase/migrations/004_upload_rules.sql");
      return { ok: false, error: "Adding files after hand-in isn't switched on yet. Tell your teacher." };
    }
    if (/upload_limit/.test(error.message)) return { ok: false, error: `You can attach up to ${MAX_FILES} files.` };
    console.error("confirmUpload save failed", error.message);
    return { ok: false, error: "Couldn't save the upload. Try again." };
  }
  if (replacing) {
    const { error: storageError } = await bucket().remove([replacing.storage_path]);
    if (storageError) console.error("confirmUpload: old text file not deleted", replacing.storage_path, storageError.message);
  }

  // A file added or changed after hand-in counts as late too if it arrives after the deadline (never reduces lateness).
  if (submission.status === "submitted") {
    const days = lateDaysAfterUpload(submission.days_late, new Date(homework.due_at), new Date());
    if (days > submission.days_late) {
      await db().from("submissions").update({ days_late: days }).eq("id", submission.id).eq("status", "submitted").lt("days_late", days);
      await refreshSavedPenalty(submission.id, days);
    }
  }

  await logActivity(student.id, "upload", {
    homework_id: homework.id,
    file_name: savedName,
    size_bytes: storedSize,
    ...(replacing ? { edited: true } : {}),
  });
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
  if (await taskLocked(upload.submissions.id)) return { ok: false, error: TASK_LOCKED };

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

/**
 * Start uploading a written piece. Returns a signed upload URL for a NEW object; the browser PUTs the text there
 * and then calls confirmUpload (with replaceUploadId when editing). Editing never overwrites the stored object in
 * place: the row only moves to the new file once confirmUpload has checked the result isn't released, so a
 * failed or refused edit leaves the old text untouched and no orphan behind.
 */
export async function uploadTaskText(input: {
  homeworkId: string;
  text: string;
  uploadId?: string;
}): Promise<Result<{ signedUrl: string; path: string; fileName: string; uploadId: string | null }>> {
  const student = await requireUser("student");
  const homework = await loadHomework(String(input.homeworkId ?? ""));
  if (!homework) return { ok: false, error: "Homework not found." };
  const text = typeof input.text === "string" ? input.text : "";
  const problem = textProblem(text);
  if (problem) return { ok: false, error: problem };

  const submission = await getOrCreateSubmission(student, homework.id);
  if (await taskLocked(submission.id)) return { ok: false, error: TASK_LOCKED };

  const existing = await uploadNames(submission.id);
  let fileName: string;
  let uploadId: string | null = null;
  if (input.uploadId !== undefined && input.uploadId !== null) {
    const target = existing.find((u) => u.id === input.uploadId);
    if (!target || !isWritingFileName(target.file_name)) return { ok: false, error: "That piece of writing wasn't found." };
    fileName = target.file_name;
    uploadId = target.id;
  } else {
    fileName = nextTextFileName(existing);
    const sizeProblem = checkUpload(fileName, new TextEncoder().encode(text).length, existing.length);
    if (sizeProblem) return { ok: false, error: sizeProblem };
  }

  const path = `${uploadFolder(student.id, homework.id)}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) {
    console.error("createSignedUploadUrl failed", error?.message);
    return { ok: false, error: "Couldn't start the upload. Try again." };
  }
  return { ok: true, signedUrl: data.signedUrl, path, fileName, uploadId };
}
