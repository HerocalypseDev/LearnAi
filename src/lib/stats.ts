import "server-only";
import { db } from "./db";
import { summarize, type SubmissionSummary } from "./marking";
import { timed } from "./perf";
import { earnedBadges, isGradeVisible, type Badge } from "./rules";
import type { Attendance, Grade, Homework, Submission, User } from "./types";

export interface StudentStats {
  student: Pick<User, "id" | "full_name" | "version" | "last_login_at">;
  /** Released (child-visible) points. */
  points: number;
  markedCount: number;
  averageScore: number | null;
  dueSoFar: number;
  onTime: number;
  late: number;
  missing: number;
  attendance: { present: number; recorded: number };
  badges: Badge[];
  /** Per homework, in due-date order: final score if marked, quiz minutes from autosave timing. */
  perHomework: { score: number | null; minutes: number | null }[];
}

export interface StatsResult {
  homeworks: Pick<Homework, "id" | "week" | "title" | "due_at" | "quiz_points">[];
  students: StudentStats[];
}

/** Quiz time per student and homework, from the autosave timing in the activity log. */
export interface QuizTime {
  user_id: string;
  homework_id: string;
  active_ms: number;
}

type StatsHomework = StatsResult["homeworks"][number];
type StatsStudent = StudentStats["student"];

/**
 * Quiz time totals added up by the database (quiz_active_ms(), migration 005), so the overview doesn't download every
 * answer_change row. Before that migration has run, falls back to adding them up here.
 */
async function loadQuizTime(): Promise<QuizTime[]> {
  const { data, error } = await timed("admin:quiz_time", () => db().rpc("quiz_active_ms"));
  if (!error) return ((data ?? []) as QuizTime[]).map((t) => ({ ...t, active_ms: Number(t.active_ms) }));
  const { data: rows } = await timed("admin:quiz_time_rows", () =>
    db()
      .from("activity_log")
      .select("user_id, detail")
      .eq("event", "answer_change")
      .returns<{ user_id: string; detail: { homework_id?: string; active_ms?: number } }[]>(),
  );
  const sums = new Map<string, QuizTime>();
  for (const r of rows ?? []) {
    if (typeof r.detail.homework_id !== "string") continue;
    const key = `${r.user_id}/${r.detail.homework_id}`;
    const t = sums.get(key) ?? { user_id: r.user_id, homework_id: r.detail.homework_id, active_ms: 0 };
    t.active_ms += Number(r.detail.active_ms ?? 0) || 0;
    sums.set(key, t);
  }
  return [...sums.values()];
}

/** Everything the teacher's overview shows, read once: the stats per student and every student x homework pair. */
export async function loadOverview(): Promise<{ stats: StatsResult; summaries: SubmissionSummary[] }> {
  const [{ data: homeworks }, { data: students }, { data: submissions }, { data: grades }, { data: attendance }, timing] =
    await Promise.all([
      timed("admin:homeworks", () =>
        db().from("homeworks").select("id, week, title, due_at, quiz_points").order("due_at").returns<StatsHomework[]>(),
      ),
      timed("admin:students", () =>
        db().from("users").select("id, full_name, version, last_login_at").eq("role", "student").order("version").returns<StatsStudent[]>(),
      ),
      timed("admin:submissions", () => db().from("submissions").select("*").returns<Submission[]>()),
      // select("*") so marked_by is included once the Jarvis migration has run, without breaking before it.
      timed("admin:grades", () => db().from("grades").select("*").returns<Grade[]>()),
      timed("admin:attendance", () => db().from("attendance").select("*").returns<Attendance[]>()),
      loadQuizTime(),
    ]);
  const hws = homeworks ?? [];
  const kids = students ?? [];
  return {
    stats: computeStats(hws, kids, submissions ?? [], grades ?? [], attendance ?? [], timing, new Date()),
    summaries: summarize(hws, kids, submissions ?? [], grades ?? []),
  };
}

export async function loadStats(): Promise<StatsResult> {
  return (await loadOverview()).stats;
}

/** The per-student numbers, from rows already read. Pure, so it can be tested without a database. */
export function computeStats(
  homeworks: StatsHomework[],
  students: StatsStudent[],
  submissions: Submission[],
  grades: Grade[],
  attendance: Attendance[],
  timing: QuizTime[],
  now: Date,
): StatsResult {
  const hws = homeworks;

  const result = students.map((student): StudentStats => {
    let points = 0;
    let onTime = 0;
    let late = 0;
    let missing = 0;
    let dueSoFar = 0;
    const marked: number[] = [];
    const badgeInput: Parameters<typeof earnedBadges>[0] = [];

    const perHomework = hws.map((hw) => {
      const sub = submissions?.find((s) => s.homework_id === hw.id && s.student_id === student.id);
      const submitted = sub?.status === "submitted";
      const grade = sub ? grades?.find((g) => g.submission_id === sub.id) : undefined;
      const due = new Date(hw.due_at);
      const visible = grade && isGradeVisible(due, grade.released_at ? new Date(grade.released_at) : null, now);

      if (due < now) {
        dueSoFar++;
        if (!submitted) missing++;
      }
      const handedIn = submitted ? sub : undefined;
      if (handedIn && handedIn.days_late > 0) late++;
      else if (handedIn) onTime++;
      if (grade) marked.push(grade.final_points);
      if (visible) points += grade.final_points;
      badgeInput.push({
        dueAt: hw.due_at,
        submittedAt: handedIn ? handedIn.submitted_at : null,
        daysLate: sub?.days_late ?? 0,
        grade: visible ? grade : null,
        quizMax: hw.quiz_points,
      });

      const ms = timing.filter((t) => t.user_id === student.id && t.homework_id === hw.id).reduce((sum, t) => sum + t.active_ms, 0);
      return { score: grade ? grade.final_points : null, minutes: ms > 0 ? Math.max(1, Math.round(ms / 60000)) : null };
    });

    const mine = attendance.filter((a) => a.student_id === student.id);
    return {
      student,
      points,
      markedCount: marked.length,
      averageScore: marked.length ? Math.round(marked.reduce((a, b) => a + b, 0) / marked.length) : null,
      dueSoFar,
      onTime,
      late,
      missing,
      attendance: { present: mine.filter((a) => a.present).length, recorded: mine.length },
      badges: earnedBadges(badgeInput, now),
      perHomework,
    };
  });

  return { homeworks: hws, students: result };
}
