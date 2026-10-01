// Course rules, kept free of I/O so they can be unit tested.

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PENALTY = { perDay: 10, cap: 50 };

/** Started days after the deadline: 1 second late = 1 day, 24h + 1s late = 2 days. */
export function daysLate(dueAt: Date, submittedAt: Date): number {
  const diff = submittedAt.getTime() - dueAt.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / DAY_MS);
}

export function latePenalty(days: number, perDay = DEFAULT_PENALTY.perDay, cap = DEFAULT_PENALTY.cap): number {
  return Math.min(Math.max(days, 0) * perDay, cap);
}

/** Final score never drops below zero. */
export function finalPoints(quiz: number, task: number, penalty: number): number {
  return Math.max(quiz + task - penalty, 0);
}

/** The child sees marks only after the deadline AND after the admin releases them. */
export function isGradeVisible(dueAt: Date, releasedAt: Date | null, now: Date): boolean {
  return releasedAt !== null && now.getTime() > dueAt.getTime();
}

export type HomeworkStatus = "upcoming" | "in_progress" | "missing" | "submitted" | "late";

export function homeworkStatus(
  dueAt: Date,
  submission: { status: "draft" | "submitted"; submitted_at: string | null } | null,
  now: Date,
): HomeworkStatus {
  if (submission?.status === "submitted" && submission.submitted_at) {
    return daysLate(dueAt, new Date(submission.submitted_at)) > 0 ? "late" : "submitted";
  }
  if (now.getTime() > dueAt.getTime()) return "missing";
  return submission ? "in_progress" : "upcoming";
}
