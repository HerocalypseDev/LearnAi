"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { logActivityInBackground } from "@/lib/activity";
import { db } from "@/lib/db";
import { timed } from "@/lib/perf";
import { autoPoints, canThumbnail, checkStoredUpload, checkUpload, THUMBNAIL_MIN_BYTES, computeGrade, daysLate, DEFAULT_PENALTY, hasHandInContent, lateDaysAfterUpload, MAX_FILES } from "@/lib/rules";
import { requireUserWith } from "@/lib/session";
import { bucket, removeFiles, safeFileName, signedPreviewLinks, thumbnailPath, uploadFolder } from "@/lib/storage";
import { isWritingFileName, nextTextFileName, textProblem } from "@/lib/task-text";
import type { Grade, Homework, PreviewLinks, QuizQuestion, Settings, Submission, User, Upload } from "@/lib/types";

/** `locked`: the result was released, so the page should re-read itself to show the task as closed. */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; locked?: boolean };

/** A task file as the student's page shows it: never the storage path. `links` are signed links valid for 1 hour. */
export interface UploadedFile {
  id: string;
  file_name: string;
  file_type: string | null;
  size_bytes: number;
  links: PreviewLinks | null;
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
function findSubmission(studentId: string, homeworkId: string) {
  return timed("action:submission", () =>
    db().from("submissions").select("*").eq("homework_id", homeworkId).eq("student_id", studentId).maybeSingle<Submission>(),
  );
}

async function getOrCreateSubmission(student: User, homeworkId: string): Promise<Submission> {
  const find = () => findSubmission(student.id, homeworkId);

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
    logActivityInBackground(student.id, "quiz_start", { homework_id: homeworkId });
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

type TaskUpload = Pick<Upload, "id" | "file_name" | "file_type" | "size_bytes" | "storage_path">;

/**
 * The homework, and this student's submission with whether its result was released and its files, in one wave
 * (the submission, grade and files come back as one query). Quiz and short answers lock at hand-in, but task files
 * stay open (they take time) until the teacher releases the result; the database trigger enforces the same rule
 * for parallel requests. `submission` is null until the student first saves or uploads something.
 */
async function loadTaskState(studentId: string, homeworkId: string) {
  if (!UUID.test(homeworkId)) return { homework: null, submission: null, released: false, files: [] as TaskUpload[] };
  const [homework, { data, error }] = await Promise.all([
    loadHomework(homeworkId),
    timed("action:task_state", () =>
      db()
        .from("submissions")
        .select("*, grades(released_at), uploads(id, file_name, file_type, size_bytes, storage_path)")
        .eq("homework_id", homeworkId)
        .eq("student_id", studentId)
        .maybeSingle<Submission & { grades: { released_at: string | null } | { released_at: string | null }[] | null; uploads: TaskUpload[] | null }>(),
    ),
  ]);
  if (error) throw new Error(error.message);
  const grade = data ? (Array.isArray(data.grades) ? data.grades[0] : data.grades) : null;
  const submission: Submission | null = data
    ? {
        id: data.id,
        homework_id: data.homework_id,
        student_id: data.student_id,
        status: data.status,
        started_at: data.started_at,
        submitted_at: data.submitted_at,
        days_late: data.days_late,
      }
    : null;
  return { homework, submission, released: !!grade?.released_at, files: data?.uploads ?? [] };
}

const toUploadedFile = (u: TaskUpload, links: PreviewLinks | null): UploadedFile => ({
  id: u.id,
  file_name: u.file_name,
  file_type: u.file_type,
  size_bytes: u.size_bytes,
  links,
});

/** Signed links for one just-saved file (and its picture preview); never throws. */
const previewLinks = (path: string, fileName: string): Promise<PreviewLinks | null> =>
  signedPreviewLinks([{ storage_path: path, file_name: fileName }])
    .then((links) => links[path] ?? null)
    .catch(() => null);

type AnswerQuestion = Pick<QuizQuestion, "id" | "version" | "type" | "options" | "correct_option" | "points">;

/**
 * Read side by side for saveAnswer: the question (which also proves the homework exists; its answer key stays on the
 * server, for auto_points) and this student's submission, if there is one yet.
 */
async function loadAnswerTarget(
  studentId: string,
  homeworkId: string,
  questionId: string,
): Promise<{ question: AnswerQuestion | null; found: Submission | null; failed: boolean }> {
  if (!UUID.test(homeworkId) || !UUID.test(questionId)) return { question: null, found: null, failed: false };
  const [{ data: question }, { data: found, error }] = await Promise.all([
    timed("autosave:question", () =>
      db()
        .from("quiz_questions")
        .select("id, version, type, options, correct_option, points")
        .eq("id", questionId)
        .eq("homework_id", homeworkId)
        .maybeSingle<AnswerQuestion>(),
    ),
    findSubmission(studentId, homeworkId),
  ]);
  return { question, found, failed: !!error };
}

/** Common case: one wave with the user row (question + submission), then the upsert. The activity row is written after. */
export async function saveAnswer(input: {
  homeworkId: string;
  questionId: string;
  answerText?: string;
  selectedOption?: number | null;
  activeMs?: number;
}): Promise<Result> {
  const [student, { question, found, failed }] = await requireUserWith("student", (studentId) =>
    loadAnswerTarget(studentId, String(input.homeworkId ?? ""), String(input.questionId ?? "")),
  );
  const homeworkId = String(input.homeworkId);
  if (!question || (question.version !== "both" && question.version !== student.version)) {
    return { ok: false, error: "Question not found." };
  }
  if (failed) return { ok: false, error: "Couldn't save. Check your internet and try again." };

  // First answer on this homework: the draft is created now (rare; usually the page visit's upload or a save made it).
  const submission = found ?? (await getOrCreateSubmission(student, homeworkId));
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
  logActivityInBackground(student.id, "answer_change", {
    homework_id: homeworkId,
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
}): Promise<Result<{ signedUrl: string; path: string; thumbUrl: string | null }>> {
  const [student, state] = await requireUserWith("student", (studentId) => loadTaskState(studentId, String(input.homeworkId ?? "")));
  const { homework, released, files } = state;
  if (!homework) return { ok: false, error: "Homework not found." };
  if (released) return { ok: false, error: TASK_LOCKED, locked: true };
  // First thing done on this homework: create the draft so confirmUpload finds it.
  if (!state.submission) await getOrCreateSubmission(student, homework.id);

  const problem = checkUpload(input.fileName, input.sizeBytes, files.length);
  if (problem) return { ok: false, error: problem };

  const path = `${uploadFolder(student.id, homework.id)}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`;
  // A big picture also gets a link for its small preview, which the browser makes and sends after the file.
  const wantsThumb = canThumbnail(input.fileName) && Number(input.sizeBytes) >= THUMBNAIL_MIN_BYTES;
  const [{ data, error }, thumb] = await Promise.all([
    timed("upload:sign_upload", () => bucket().createSignedUploadUrl(path)),
    wantsThumb ? timed("upload:sign_thumb", () => bucket().createSignedUploadUrl(thumbnailPath(path))) : null,
  ]);
  if (error || !data) {
    console.error("createSignedUploadUrl failed", error?.message);
    return { ok: false, error: "Couldn't start the upload. Try again." };
  }
  return { ok: true, signedUrl: data.signedUrl, path, thumbUrl: thumb?.data?.signedUrl ?? null };
}

/**
 * The size the storage service holds for a just-uploaded object, not what the browser said. Its listing can lag a
 * moment behind the upload, so look a few times; null size means still unknown (the child is asked to retry).
 */
async function storedObject(folder: string, objectName: string) {
  let object: { name: string; metadata?: { size?: unknown } | null } | undefined;
  let size: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300));
    const { data: listed } = await timed("upload:storage_list", () => bucket().list(folder, { search: objectName, limit: 10 }));
    object = listed?.find((o) => o.name === objectName);
    const reported = object?.metadata?.size;
    size = reported === undefined || reported === null ? null : Number(reported);
    if (object && size !== null && Number.isFinite(size)) break;
  }
  return { found: !!object, size };
}

/**
 * Records an uploaded file (or moves a written piece to its new text) and answers with the file as the page shows
 * it, so the browser can update its list without re-reading the whole page. One wave with the user row: the
 * homework, the submission with its release state and files, and the storage listing; then the insert.
 */
export async function confirmUpload(input: {
  homeworkId: string;
  path: string;
  fileName: string;
  fileType: string;
  /** A written piece (Writing-N.txt) being edited: the new file replaces this upload's content. */
  replaceUploadId?: string;
}): Promise<Result<{ upload: UploadedFile }>> {
  const homeworkId = String(input.homeworkId ?? "");
  const path = String(input.path ?? "");
  const [student, [state, stored]] = await requireUserWith("student", (studentId) => {
    const folder = uploadFolder(studentId, homeworkId);
    const objectName = path.slice(folder.length + 1);
    const inFolder = UUID.test(homeworkId) && path.startsWith(`${folder}/`) && !!objectName && !objectName.includes("/");
    return Promise.all([
      loadTaskState(studentId, homeworkId),
      inFolder ? storedObject(folder, objectName) : Promise.resolve(null),
    ]);
  });
  const { homework } = state;
  if (!homework) return { ok: false, error: "Homework not found." };
  if (!stored) return { ok: false, error: "Upload not found." };
  const objectName = path.slice(uploadFolder(student.id, homework.id).length + 1);
  const fileName = String(input.fileName ?? "").slice(0, 200);
  const fileType = String(input.fileType ?? "").slice(0, 100) || null;

  // requestUpload created the draft; this is only a fallback.
  const submission = state.submission ?? (await getOrCreateSubmission(student, homework.id));
  const files = state.submission ? state.files : [];

  // Confirming the same file twice (double tap, retry) is fine and must never delete the stored file,
  // so this comes before anything below that may remove the object.
  const recorded = files.find((u) => u.storage_path === path);
  if (recorded) return { ok: true, upload: toUploadedFile(recorded, await previewLinks(path, recorded.file_name)) };

  if (state.released) {
    await removeFiles([path]);
    return { ok: false, error: TASK_LOCKED, locked: true };
  }

  // Editing a written piece: it must be one of this submission's Writing-N.txt files.
  let replacing: TaskUpload | null = null;
  if (input.replaceUploadId !== undefined) {
    replacing = files.find((u) => u.id === String(input.replaceUploadId)) ?? null;
    if (!replacing || !isWritingFileName(replacing.file_name)) {
      await removeFiles([path]);
      return { ok: false, error: "That piece of writing wasn't found. Close the editor and try again." };
    }
  }

  if (!stored.found) return { ok: false, error: "The upload didn't arrive. Try again." };
  const { size } = stored;
  // A replacement doesn't add a file, so it doesn't count against the limit.
  const verdict = checkStoredUpload(fileName, objectName, size, replacing ? 0 : files.length);
  if (verdict) {
    if (!verdict.retryable) await removeFiles([path]);
    return { ok: false, error: verdict.problem };
  }
  const storedSize = size as number;

  // The link the browser shows for the new file is signed alongside the write (it is only handed out if the write worked).
  const linkPromise = previewLinks(path, fileName);
  let error: { code?: string; message: string } | null;
  let saved: TaskUpload;
  if (replacing) {
    // Point the row at the new file, then drop the old one. The upload trigger (004) refuses this once released.
    // Matching the old path too means two edits saved at once can't both win: the loser changes nothing.
    const res = await timed("upload:update", () =>
      db()
        .from("uploads")
        .update({ storage_path: path, size_bytes: storedSize, file_type: fileType, uploaded_at: new Date().toISOString() })
        .eq("id", replacing.id)
        .eq("storage_path", replacing.storage_path)
        .select("id"),
    );
    error = res.error;
    if (!error && !res.data?.length) {
      await removeFiles([path]);
      return { ok: false, error: "This writing was changed somewhere else. Close the editor and open it again." };
    }
    saved = { ...replacing, storage_path: path, size_bytes: storedSize, file_type: fileType };
  } else {
    // Two written pieces started at once (two tabs) could both be offered the same Writing-N name: re-number here.
    let savedName = fileName;
    if (isWritingFileName(savedName) && files.some((u) => u.file_name === savedName)) savedName = nextTextFileName(files);
    // The database is the hard gate: a trigger (supabase/schema.sql, enforce_upload_rules) locks the submission,
    // and refuses the row if the result was released or it already has MAX_FILES files, even for parallel requests.
    const res = await timed("upload:insert", () =>
      db()
        .from("uploads")
        .insert({
          submission_id: submission.id,
          file_name: savedName,
          file_type: fileType,
          size_bytes: storedSize,
          storage_path: path,
        })
        .select("id")
        .single<{ id: string }>(),
    );
    error = res.error;
    saved = { id: res.data?.id ?? "", file_name: savedName, file_type: fileType, size_bytes: storedSize, storage_path: path };
  }
  if (error) {
    if (error.code === "23505") {
      // This exact file was already recorded (double confirm): answer with that row.
      const { data: row } = await db().from("uploads").select("id, file_name, file_type, size_bytes, storage_path").eq("storage_path", path).maybeSingle<TaskUpload>();
      if (row) return { ok: true, upload: toUploadedFile(row, await linkPromise) };
      return { ok: false, error: "Couldn't save the upload. Reload the page." };
    }
    await removeFiles([path]); // never leave a stored file that has no row
    if (/task_locked/.test(error.message)) return { ok: false, error: TASK_LOCKED, locked: true };
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
    const oldPath = replacing.storage_path;
    after(async () => {
      const { error: storageError } = await bucket().remove([oldPath]);
      if (storageError) console.error("confirmUpload: old text file not deleted", oldPath, storageError.message);
    });
  }

  // A file added or changed after hand-in counts as late too if it arrives after the deadline (never reduces lateness).
  if (submission.status === "submitted") {
    const days = lateDaysAfterUpload(submission.days_late, new Date(homework.due_at), new Date());
    if (days > submission.days_late) {
      await db().from("submissions").update({ days_late: days }).eq("id", submission.id).eq("status", "submitted").lt("days_late", days);
      await refreshSavedPenalty(submission.id, days);
    }
  }

  logActivityInBackground(student.id, "upload", {
    homework_id: homework.id,
    file_name: saved.file_name,
    size_bytes: storedSize,
    ...(replacing ? { edited: true } : {}),
  });
  return { ok: true, upload: toUploadedFile(saved, await linkPromise) };
}

/** Removes one of the student's own task files: the lookup checks ownership and the release in the same query. */
export async function removeUpload(uploadId: string): Promise<Result> {
  const [student, upload] = await requireUserWith("student", async (studentId) => {
    if (!UUID.test(String(uploadId))) return null;
    const { data } = await timed("upload:find", () =>
      db()
        .from("uploads")
        .select("id, storage_path, file_name, submissions!inner(id, student_id, status, homework_id, grades(released_at))")
        .eq("id", uploadId)
        .eq("submissions.student_id", studentId)
        .maybeSingle<{
          id: string;
          storage_path: string;
          file_name: string;
          submissions: Pick<Submission, "id" | "student_id" | "status" | "homework_id"> & {
            grades: { released_at: string | null } | { released_at: string | null }[] | null;
          };
        }>(),
    );
    return data;
  });
  if (!upload || upload.submissions.student_id !== student.id) return { ok: false, error: "File not found." };
  const grade = Array.isArray(upload.submissions.grades) ? upload.submissions.grades[0] : upload.submissions.grades;
  if (grade?.released_at) return { ok: false, error: TASK_LOCKED, locked: true };

  // Row first: if the file can't be deleted from storage afterwards it is just an unreferenced leftover,
  // whereas the other order could leave a listed file whose content is gone.
  const { error } = await timed("upload:delete", () => db().from("uploads").delete().eq("id", upload.id));
  if (error) return { ok: false, error: "Couldn't remove the file. Try again." };
  after(async () => {
    const { error: storageError } = await removeFiles([upload.storage_path]);
    if (storageError) console.error("removeUpload: storage delete failed", upload.storage_path, storageError.message);
  });

  logActivityInBackground(student.id, "upload", {
    homework_id: upload.submissions.homework_id,
    file_name: upload.file_name,
    removed: true,
  });
  return { ok: true };
}

export async function submitHomework(homeworkId: string): Promise<Result> {
  const [student, [homework, { data: found }]] = await requireUserWith("student", (studentId) =>
    Promise.all([loadHomework(homeworkId), UUID.test(homeworkId) ? findSubmission(studentId, homeworkId) : Promise.resolve({ data: null })]),
  );
  if (!homework) return { ok: false, error: "Homework not found." };

  const submission = found ?? (await getOrCreateSubmission(student, homework.id));
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

  logActivityInBackground(student.id, "submit", { homework_id: homework.id, days_late: late });
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
  const [student, state] = await requireUserWith("student", (studentId) => loadTaskState(studentId, String(input.homeworkId ?? "")));
  const { homework, released } = state;
  if (!homework) return { ok: false, error: "Homework not found." };
  const text = typeof input.text === "string" ? input.text : "";
  const problem = textProblem(text);
  if (problem) return { ok: false, error: problem };
  if (released) return { ok: false, error: TASK_LOCKED, locked: true };
  if (!state.submission) await getOrCreateSubmission(student, homework.id);

  const existing = state.files;
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
  const { data, error } = await timed("upload:sign_upload", () => bucket().createSignedUploadUrl(path));
  if (error || !data) {
    console.error("createSignedUploadUrl failed", error?.message);
    return { ok: false, error: "Couldn't start the upload. Try again." };
  }
  return { ok: true, signedUrl: data.signedUrl, path, fileName, uploadId };
}
