import "server-only";
import { toCsv } from "./csv";
import { db } from "./db";
import { PARTS } from "./rules";
import { loadStats } from "./stats";
import { TIME_ZONE } from "./time";
import type { Attendance, Grade, Homework, Submission, User } from "./types";

// Lagos local time as "2026-10-07 21:00" so it sorts and reads well in a spreadsheet.
function lagos(iso: string | null | undefined) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export const EXPORT_KINDS = ["scores.csv", "activity.csv", "attendance.csv"] as const;

/** CSV text for one export, or null for an unknown kind. */
export async function buildCsv(kind: string): Promise<string | null> {
  let csv: string;
  if (kind === "scores.csv") {
    const [{ data: homeworks }, { data: students }, { data: submissions }, { data: grades }] = await Promise.all([
      db().from("homeworks").select("*").order("due_at").returns<Homework[]>(),
      db().from("users").select("*").eq("role", "student").order("version").returns<User[]>(),
      db().from("submissions").select("*").returns<Submission[]>(),
      db().from("grades").select("*").returns<Grade[]>(),
    ]);
    const rows = [];
    for (const s of students ?? []) {
      for (const h of homeworks ?? []) {
        const sub = submissions?.find((x) => x.homework_id === h.id && x.student_id === s.id);
        const g = sub ? grades?.find((x) => x.submission_id === sub.id) : undefined;
        const status = sub?.status === "submitted" ? (sub.days_late > 0 ? "late" : "on time") : new Date(h.due_at) < new Date() ? "missing" : "not yet due";
        rows.push([
          s.full_name, s.version, h.week, h.title, lagos(h.due_at), status, lagos(sub?.submitted_at), sub?.days_late ?? "",
          g?.quiz_points ?? "", g?.task_points ?? "", g?.late_penalty ?? "", g?.final_points ?? "", g?.released_at ? "yes" : "no", g?.comment ?? "",
        ]);
      }
    }
    const stats = await loadStats();
    for (const st of stats.students) {
      rows.push([st.student.full_name, st.student.version, "", "TOTAL (released)", "", "", "", "", "", "", "", st.points, "", st.badges.map((b) => b.name).join("; ")]);
    }
    csv = toCsv(
      ["Student", "Version", "Week", "Homework", "Due", "Status", "Handed in", "Days late", `Quiz /${PARTS.mcq + PARTS.short}`, `Task /${PARTS.task}`, "Late penalty", "Final /100", "Released", "Comment / badges"],
      rows,
    );
  } else if (kind === "activity.csv") {
    const { data } = await db()
      .from("activity_log")
      .select("created_at, event, detail, device, browser, users(full_name)")
      .order("created_at")
      .limit(20000)
      .returns<{ created_at: string; event: string; detail: Record<string, unknown>; device: string | null; browser: string | null; users: { full_name: string } | null }[]>();
    csv = toCsv(
      ["Time (Lagos)", "Who", "Event", "Device", "Browser", "Details"],
      (data ?? []).map((r) => [lagos(r.created_at), r.users?.full_name ?? "", r.event, r.device, r.browser, JSON.stringify(r.detail)]),
    );
  } else if (kind === "attendance.csv") {
    const { data } = await db()
      .from("attendance")
      .select("sunday_date, present, note, users(full_name)")
      .order("sunday_date")
      .returns<(Pick<Attendance, "sunday_date" | "present" | "note"> & { users: { full_name: string } | null })[]>();
    csv = toCsv(["Sunday", "Student", "Present", "Note"], (data ?? []).map((r) => [r.sunday_date, r.users?.full_name ?? "", r.present ? "yes" : "no", r.note]));
  } else {
    return null;
  }
  return csv;
}
