import "server-only";
import { db } from "./db";
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

export async function loadStats(): Promise<StatsResult> {
  const [{ data: homeworks }, { data: students }, { data: submissions }, { data: grades }, { data: attendance }, { data: timing }] =
    await Promise.all([
      db().from("homeworks").select("id, week, title, due_at, quiz_points").order("due_at").returns<StatsResult["homeworks"]>(),
      db()
        .from("users")
        .select("id, full_name, version, last_login_at")
        .eq("role", "student")
        .order("version")
        .returns<StudentStats["student"][]>(),
      db().from("submissions").select("*").returns<Submission[]>(),
      db().from("grades").select("*").returns<Grade[]>(),
      db().from("attendance").select("*").returns<Attendance[]>(),
      db()
        .from("activity_log")
        .select("user_id, detail")
        .eq("event", "answer_change")
        .returns<{ user_id: string; detail: { homework_id?: string; active_ms?: number } }[]>(),
    ]);

  const now = new Date();
  const hws = homeworks ?? [];

  const result = (students ?? []).map((student): StudentStats => {
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
      if (submitted && sub!.days_late > 0) late++;
      else if (submitted) onTime++;
      if (grade) marked.push(grade.final_points);
      if (visible) points += grade.final_points;
      badgeInput.push({
        dueAt: hw.due_at,
        submittedAt: submitted ? sub!.submitted_at : null,
        daysLate: sub?.days_late ?? 0,
        grade: visible ? grade : null,
        quizMax: hw.quiz_points,
      });

      const ms = (timing ?? [])
        .filter((t) => t.user_id === student.id && t.detail.homework_id === hw.id)
        .reduce((sum, t) => sum + Number(t.detail.active_ms ?? 0), 0);
      return { score: grade ? grade.final_points : null, minutes: ms > 0 ? Math.max(1, Math.round(ms / 60000)) : null };
    });

    const mine = (attendance ?? []).filter((a) => a.student_id === student.id);
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
