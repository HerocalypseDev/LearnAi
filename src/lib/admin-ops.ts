import "server-only";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { loadMarking } from "./marking";
import { checkQuestionBudget, clampPoints, computeGrade, normalizeMcq, PARTS, passwordProblem, quizScore } from "./rules";
import { fromLagosInputs, toLagosInputs } from "./time";
import type { Grade, Homework, QuizQuestion, User } from "./types";

// Every admin change lives here, so the website (server actions) and Jarvis (the API in
// app/api/jarvis) follow exactly the same rules. Callers check who is allowed first.

export class OpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type Actor = "admin" | "jarvis";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertId(id: unknown, what: string): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new OpError(`${what} not found.`, 404);
  return id;
}

/** True when Postgres/PostgREST says a column doesn't exist (the optional Jarvis migration hasn't been run). */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "PGRST204" || error.code === "42703" || /column .* does not exist|Could not find the .* column/i.test(error.message ?? ""));
}

/** Run a write; if it fails only because optional columns are missing, retry without them. */
async function withOptionalColumns<T extends Record<string, unknown>>(
  row: T,
  optional: (keyof T)[],
  write: (row: Partial<T>) => PromiseLike<{ error: { code?: string; message: string } | null }>,
) {
  let { error } = await write(row);
  if (isMissingColumn(error)) {
    const trimmed = { ...row };
    for (const key of optional) delete trimmed[key];
    ({ error } = await write(trimmed));
  }
  if (error) throw new OpError(error.message, 500);
}

// ---------- Students ----------

/** Find a student by id, username or name ("james", "James", a uuid). */
export async function resolveStudent(ref: unknown): Promise<Pick<User, "id" | "full_name" | "username" | "version">> {
  const value = String(ref ?? "").trim();
  if (!value) throw new OpError("Say which student (James or Peter).");
  const { data } = await db()
    .from("users")
    .select("id, full_name, username, version")
    .eq("role", "student")
    .returns<Pick<User, "id" | "full_name" | "username" | "version">[]>();
  const lower = value.toLowerCase();
  const match = (data ?? []).find(
    (s) => s.id === value || s.username === lower || s.full_name.toLowerCase() === lower || s.full_name.toLowerCase().split(" ")[0] === lower,
  );
  if (!match) throw new OpError(`No student called "${value}".`, 404);
  return match;
}

// ---------- Homework ----------

export interface HomeworkInput {
  week?: unknown;
  title?: unknown;
  due_date?: unknown;
  due_time?: unknown;
  instructions_a?: unknown;
  instructions_b?: unknown;
  marking_notes?: unknown;
}

const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v).trim());

function homeworkRow(input: HomeworkInput, current?: Homework) {
  const row: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = str(input.title);
    if (!title) throw new OpError("Give the homework a title.");
    row.title = title.slice(0, 200);
  }
  if (input.week !== undefined) {
    const week = Number(input.week);
    if (![1, 2, 3, 4].includes(week)) throw new OpError("Pick a week from 1 to 4.");
    row.week = week;
  }
  if (input.due_date !== undefined || input.due_time !== undefined) {
    const existing = current ? toLagosInputs(current.due_at) : null;
    const date = str(input.due_date) ?? existing?.date ?? "";
    const time = str(input.due_time) || existing?.time || "21:00";
    const dueAt = fromLagosInputs(date, time);
    if (!dueAt) throw new OpError("Pick a due date (YYYY-MM-DD) and time (HH:MM, Lagos).");
    row.due_at = dueAt.toISOString();
  }
  if (input.instructions_a !== undefined) row.instructions_a = str(input.instructions_a) ?? "";
  if (input.instructions_b !== undefined) row.instructions_b = str(input.instructions_b) ?? "";
  if (input.marking_notes !== undefined) row.marking_notes = str(input.marking_notes) ?? "";
  return row;
}

export async function getHomework(id: unknown): Promise<Homework> {
  const homeworkId = assertId(id, "Homework");
  const { data } = await db().from("homeworks").select("*").eq("id", homeworkId).maybeSingle<Homework>();
  if (!data) throw new OpError("Homework not found.", 404);
  return data;
}

export async function createHomework(input: HomeworkInput): Promise<Homework> {
  if (input.title === undefined) throw new OpError("Give the homework a title.");
  if (input.due_date === undefined) throw new OpError("Pick a due date.");
  const row = homeworkRow({ week: 1, ...input });
  const holder: { created?: Homework } = {};
  await withOptionalColumns(row, ["marking_notes"], async (r) => {
    const res = await db().from("homeworks").insert(r).select("*").single<Homework>();
    if (res.data) holder.created = res.data;
    return res;
  });
  if (!holder.created) throw new OpError("Could not create the homework.", 500);
  return holder.created;
}

// Policy: the deadline can't move once anyone has handed in. days_late, penalties and released grades were
// all worked out against the old deadline, so a quiet change would leave them wrong. Delete nothing, ask the teacher to re-open instead.
export async function updateHomework(id: unknown, input: HomeworkInput): Promise<Homework> {
  const current = await getHomework(id);
  const row = homeworkRow(input, current);
  if (Object.keys(row).length === 0) return current;
  if (typeof row.due_at === "string" && new Date(row.due_at).getTime() !== new Date(current.due_at).getTime()) {
    const { count, error } = await db()
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("homework_id", current.id)
      .eq("status", "submitted");
    if (error) throw new OpError(error.message, 500);
    if ((count ?? 0) > 0) {
      throw new OpError("Someone has already handed this in, so the deadline can't change (their lateness and marks depend on it).");
    }
  }
  await withOptionalColumns(row, ["marking_notes"], (r) => db().from("homeworks").update(r).eq("id", current.id));
  return getHomework(current.id);
}

export async function deleteHomework(id: unknown): Promise<Homework> {
  const homework = await getHomework(id);
  const { error } = await db().from("homeworks").delete().eq("id", homework.id);
  if (error) throw new OpError(error.message, 500);
  return homework;
}

// ---------- Questions ----------

export interface QuestionInput {
  id?: unknown;
  homework_id?: unknown;
  type?: unknown;
  version?: unknown;
  prompt?: unknown;
  options?: unknown;
  /** Index into `options` as given (blank options are dropped and the index follows). */
  correct_option?: unknown;
  points?: unknown;
  position?: unknown;
}

export async function saveQuestion(input: QuestionInput): Promise<QuizQuestion & { warning?: string }> {
  const existing = input.id
    ? (
        await db()
          .from("quiz_questions")
          .select("*")
          .eq("id", assertId(input.id, "Question"))
          .maybeSingle<QuizQuestion>()
      ).data
    : null;
  if (input.id && !existing) throw new OpError("Question not found.", 404);

  const homework = await getHomework(input.homework_id ?? existing?.homework_id);
  const type = String(input.type ?? existing?.type ?? "");
  const version = String(input.version ?? existing?.version ?? "both");
  const prompt = str(input.prompt) ?? existing?.prompt ?? "";
  if (!prompt) throw new OpError("Write the question.");
  if (type !== "mcq" && type !== "short") throw new OpError('Question type must be "mcq" or "short".');
  if (!["A", "B", "both"].includes(version)) throw new OpError('Version must be "A", "B" or "both".');

  // Short answer questions are always worth the fixed short-answer points.
  const points = type === "short" ? PARTS.short : Number(input.points ?? existing?.points);
  if (!Number.isInteger(points) || points < 1 || points > PARTS.mcq) {
    throw new OpError(`Points must be a whole number from 1 to ${PARTS.mcq}.`);
  }

  let options: string[] = [];
  let correctOption: number | null = null;
  if (type === "mcq") {
    const rawOptions = Array.isArray(input.options) ? input.options : (existing?.options ?? []);
    const correctRaw = Array.isArray(input.options) ? input.correct_option : (input.correct_option ?? existing?.correct_option);
    const mcq = normalizeMcq(rawOptions, correctRaw);
    if ("error" in mcq) throw new OpError(mcq.error);
    options = mcq.options;
    correctOption = mcq.correct;
  }

  const { data: siblings, error: siblingError } = await db()
    .from("quiz_questions")
    .select("id, version, type, points")
    .eq("homework_id", homework.id)
    .returns<Pick<QuizQuestion, "id" | "version" | "type" | "points">[]>();
  if (siblingError) throw new OpError(siblingError.message, 500);
  const budgetProblem = checkQuestionBudget(
    (siblings ?? []).filter((q) => q.id !== existing?.id),
    { version: version as QuizQuestion["version"], type, points },
  );
  if (budgetProblem) throw new OpError(budgetProblem);

  let position = input.position !== undefined && input.position !== "" ? Number(input.position) : existing?.position;
  if (position === undefined || !Number.isFinite(position)) {
    const { data } = await db().from("quiz_questions").select("position").eq("homework_id", homework.id);
    position = (data ?? []).reduce((max, q) => Math.max(max, q.position), 0) + 1;
  }

  const row = { homework_id: homework.id, type, version, prompt, points, position, options, correct_option: correctOption };
  const { data, error } = existing
    ? await db().from("quiz_questions").update(row).eq("id", existing.id).select("*").single<QuizQuestion>()
    : await db().from("quiz_questions").insert(row).select("*").single<QuizQuestion>();
  if (error || !data) throw new OpError(error?.message ?? "Could not save the question.", 500);

  // Marks are always recomputed from the current question when you save marks, but grades already saved
  // (and possibly released) keep their old numbers until then. Say so instead of changing them silently.
  if (existing?.type === "mcq" && (existing.correct_option !== data.correct_option || existing.points !== data.points)) {
    const { count } = await db()
      .from("answers")
      .select("id", { count: "exact", head: true })
      .eq("question_id", data.id)
      .not("selected_option", "is", null);
    if ((count ?? 0) > 0) {
      return { ...data, warning: `${count} answer(s) already exist. Open each marked homework and Save again to update its score.` };
    }
  }
  return data;
}

export async function deleteQuestion(id: unknown): Promise<{ homework_id: string }> {
  const questionId = assertId(id, "Question");
  const { data } = await db().from("quiz_questions").select("homework_id").eq("id", questionId).maybeSingle();
  if (!data) throw new OpError("Question not found.", 404);
  const { error } = await db().from("quiz_questions").delete().eq("id", questionId);
  if (error) throw new OpError(error.message, 500);
  return { homework_id: data.homework_id };
}

// ---------- Marking ----------

export type ReleaseIntent = "keep" | "release" | "hide";

export interface MarksInput {
  homeworkId: unknown;
  studentId: string;
  /** Points per short-answer question id. Missing questions keep their current mark. */
  shortPoints?: Record<string, unknown>;
  /** Missing = keep the current task mark. */
  taskPoints?: unknown;
  /** Missing = keep the current comment. */
  comment?: unknown;
  release?: ReleaseIntent;
  /** Who did the marking. Omit when only releasing/hiding, to keep the current value. */
  markedBy?: Actor;
}

export async function saveMarks(input: MarksInput) {
  const homeworkId = assertId(input.homeworkId, "Homework");
  const data = await loadMarking(homeworkId, input.studentId);
  if (!data) throw new OpError("Homework or student not found.", 404);
  if (!data.submission) throw new OpError(`${data.student.full_name} hasn't started this homework, so there's nothing to mark.`);
  if (data.submission.status !== "submitted") throw new OpError(`${data.student.full_name} hasn't handed this homework in yet.`);
  const { submission, homework, questions, answers, penalty, grade } = data;

  // Multiple choice is re-marked from the questions as they are now, never from the stored auto_points.
  const picks: Record<string, { selected_option: number | null; manual_points: number | null }> = {};
  for (const q of questions) {
    const existing = answers[q.id];
    const given = input.shortPoints?.[q.id];
    picks[q.id] = {
      selected_option: existing?.selected_option ?? null,
      manual_points: q.type === "short" ? (given !== undefined ? clampPoints(given, q.points) : (existing?.manual_points ?? 0)) : null,
    };
  }
  const quizPoints = quizScore(questions, picks, homework.quiz_points).total;
  const answerRows = questions.map((q) => {
    const existing = answers[q.id];
    return {
      submission_id: submission.id,
      question_id: q.id,
      answer_text: existing?.answer_text ?? null,
      selected_option: picks[q.id].selected_option,
      auto_points: q.type === "mcq" ? quizScore([q], picks, q.points).mcq : null,
      manual_points: picks[q.id].manual_points,
      updated_at: existing?.updated_at ?? new Date().toISOString(),
    };
  });

  if (answerRows.length) {
    const { error } = await db().from("answers").upsert(answerRows, { onConflict: "submission_id,question_id" });
    if (error) throw new OpError(error.message, 500);
  }

  const taskPoints =
    input.taskPoints !== undefined ? clampPoints(input.taskPoints, homework.task_points) : (grade?.task_points ?? 0);
  const { late_penalty, final_points } = computeGrade({
    quizPoints,
    taskPoints,
    daysLate: submission.days_late,
    perDay: penalty.perDay,
    cap: penalty.cap,
  });
  const release = input.release ?? "keep";
  const releasedAt = release === "release" ? new Date().toISOString() : release === "hide" ? null : (grade?.released_at ?? null);
  const comment = input.comment !== undefined ? str(input.comment)?.slice(0, 4000) || null : (grade?.comment ?? null);

  const row = {
    submission_id: submission.id,
    quiz_points: quizPoints,
    task_points: taskPoints,
    late_penalty,
    final_points,
    comment,
    released_at: releasedAt,
    marked_by: input.markedBy ?? grade?.marked_by ?? "admin",
  };
  await withOptionalColumns(row, ["marked_by"], (r) => db().from("grades").upsert(r, { onConflict: "submission_id" }));

  // Marking is last-write-wins (two people saving at once: the later save stands). Report what is actually
  // stored now, so the caller (page or Jarvis) sees the truth rather than what it sent.
  const { data: saved } = await db().from("grades").select("*").eq("submission_id", submission.id).maybeSingle<Grade>();
  const stored = saved ?? { ...row, id: "", marked_by: row.marked_by };
  return {
    student: data.student.full_name,
    homework: homework.title,
    quiz_points: stored.quiz_points,
    task_points: stored.task_points,
    late_penalty: stored.late_penalty,
    final_points: stored.final_points,
    max_points: homework.max_points,
    comment: stored.comment,
    released: stored.released_at !== null,
    visible_to_child: stored.released_at !== null && Date.now() > new Date(homework.due_at).getTime(),
  };
}

// ---------- Attendance ----------

export async function setAttendance(input: { studentId: string; date: unknown; present: boolean | null; note?: unknown }) {
  const date = String(input.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new OpError("Date must look like 2026-10-04.");
  const note = str(input.note)?.slice(0, 500) || null;
  const { error } =
    input.present === null
      ? await db().from("attendance").delete().eq("student_id", input.studentId).eq("sunday_date", date)
      : await db()
          .from("attendance")
          .upsert({ student_id: input.studentId, sunday_date: date, present: input.present, note }, { onConflict: "student_id,sunday_date" });
  if (error) throw new OpError(error.message, 500);
}

// ---------- Settings & passwords ----------

export async function updateSettings(perDayRaw: unknown, capRaw: unknown) {
  const perDay = Number(perDayRaw);
  const cap = Number(capRaw);
  if (!Number.isInteger(perDay) || perDay < 0 || perDay > 100) throw new OpError("Points per day must be a whole number from 0 to 100.");
  if (!Number.isInteger(cap) || cap < 0 || cap > 100) throw new OpError("The cap must be a whole number from 0 to 100.");
  const { error } = await db()
    .from("settings")
    .upsert({ id: 1, late_penalty_per_day: perDay, late_penalty_cap: cap, updated_at: new Date().toISOString() });
  if (error) throw new OpError(error.message, 500);
  return { late_penalty_per_day: perDay, late_penalty_cap: cap };
}

export async function setUserPassword(userId: unknown, password: unknown) {
  const id = assertId(userId, "User");
  const pw = String(password ?? "");
  const { data: target } = await db()
    .from("users")
    .select("id, full_name, role")
    .eq("id", id)
    .maybeSingle<Pick<User, "id" | "full_name" | "role">>();
  if (!target) throw new OpError("User not found.", 404);
  const problem = passwordProblem(pw, target.role);
  if (problem) throw new OpError(problem);
  const passwordHash = await bcrypt.hash(pw, 12);
  const { error } = await db().from("users").update({ password_hash: passwordHash }).eq("id", id);
  if (error) throw new OpError("Could not save the password. Try again.", 500);
  return { id: target.id, full_name: target.full_name, role: target.role, password_hash: passwordHash };
}
