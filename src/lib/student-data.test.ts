import { describe, expect, it } from "vitest";
import { joinStudentHomework } from "./student-data";
import type { Homework } from "./types";

const hw = (id: string, due: string): Homework => ({
  id, week: 1, title: id, due_at: due, instructions_a: "", instructions_b: "", max_points: 100, quiz_points: 40, task_points: 60,
});
const grade = (released_at: string | null) => ({ quiz_points: 30, task_points: 50, late_penalty: 0, final_points: 80, comment: "Good", released_at });
const sub = (homework_id: string, grades: unknown) => ({
  id: `s-${homework_id}`, homework_id, status: "submitted" as const, submitted_at: "2026-01-01T10:00:00Z", days_late: 0,
  grades: grades as ReturnType<typeof grade> | null,
});
const now = new Date("2026-01-10T12:00:00Z");

describe("joinStudentHomework", () => {
  it("shows a grade only once the deadline has passed and it is released", () => {
    const items = joinStudentHomework(
      [hw("past-released", "2026-01-02T20:00:00Z"), hw("past-unreleased", "2026-01-02T20:00:00Z"), hw("future-released", "2026-02-01T20:00:00Z")],
      [sub("past-released", grade("2026-01-05T00:00:00Z")), sub("past-unreleased", grade(null)), sub("future-released", grade("2026-01-05T00:00:00Z"))],
      now,
    );
    expect(items.map((i) => i.grade?.final_points ?? null)).toEqual([80, null, null]);
    // The lock follows the release even before the deadline; the marks don't.
    expect(items.map((i) => i.released)).toEqual([true, false, true]);
  });

  it("accepts the embedded grade as an object or a one-item array, and handles no submission", () => {
    const items = joinStudentHomework(
      [hw("a", "2026-01-02T20:00:00Z"), hw("b", "2026-01-02T20:00:00Z"), hw("c", "2026-01-02T20:00:00Z")],
      [sub("a", [grade("2026-01-05T00:00:00Z")]), sub("b", [])],
      now,
    );
    expect(items[0].grade?.final_points).toBe(80);
    expect(items[1]).toMatchObject({ grade: null, released: false, status: "submitted" });
    expect(items[2]).toMatchObject({ submission: null, grade: null, status: "missing" });
    // The embedded row never rides along on the submission object.
    expect(Object.keys(items[0].submission ?? {})).not.toContain("grades");
  });
});
