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

// ---- Uploads ----

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 10;
export const BLOCKED_EXTENSIONS = [
  "exe", "apk", "bat", "msi", "sh", "js",
  "cmd", "com", "scr", "ps1", "vbs", "jar", "dll", "app", "dmg", "deb", "rpm", "msix", "appx", "ipa",
];

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Returns a child-friendly error, or null if the file is allowed. */
export function checkUpload(name: string, sizeBytes: number, filesAlready: number): string | null {
  if (filesAlready >= MAX_FILES) return `You can attach up to ${MAX_FILES} files.`;
  if (BLOCKED_EXTENSIONS.includes(fileExtension(name))) return `"${name}" is a program file, which isn't allowed.`;
  if (sizeBytes <= 0) return `"${name}" is empty.`;
  if (sizeBytes > MAX_FILE_BYTES) return `"${name}" is bigger than 20MB.`;
  return null;
}

// ---- Quiz ----

/** Multiple choice is auto-marked; short answers are marked by the admin (null until then). */
export function autoPoints(
  question: { type: "mcq" | "short"; correct_option: number | null; points: number },
  selectedOption: number | null,
): number | null {
  if (question.type !== "mcq") return null;
  return selectedOption !== null && selectedOption === question.correct_option ? question.points : 0;
}

// ---- Marking ----

export function computeGrade(input: {
  quizPoints: number;
  taskPoints: number;
  daysLate: number;
  perDay?: number;
  cap?: number;
}) {
  const penalty = latePenalty(input.daysLate, input.perDay, input.cap);
  return { late_penalty: penalty, final_points: finalPoints(input.quizPoints, input.taskPoints, penalty) };
}

/** Clamp a typed mark to a whole number between 0 and max (blank counts as 0). */
export function clampPoints(value: unknown, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
}

// ---- Homework structure ----

/** Every homework: multiple choice 30 + short explanation 10 (= quiz 40), plus an uploaded task worth 60. */
export const PARTS = { mcq: 30, short: 10, task: 60 } as const;

export function quizTotals(questions: { type: "mcq" | "short"; points: number }[]) {
  return {
    mcq: questions.filter((q) => q.type === "mcq").reduce((s, q) => s + q.points, 0),
    short: questions.filter((q) => q.type === "short").reduce((s, q) => s + q.points, 0),
  };
}

// ---- Badges ----

export interface BadgeInput {
  dueAt: string;
  submittedAt: string | null;
  daysLate: number;
  /** Only grades the child can already see. */
  grade: { quiz_points: number; final_points: number } | null;
  quizMax: number;
}

export interface Badge {
  icon: string;
  name: string;
  description: string;
}

export function earnedBadges(items: BadgeInput[], now: Date): Badge[] {
  const handedIn = items.filter((i) => i.submittedAt);
  const onTime = handedIn.filter((i) => i.daysLate === 0);
  const dueSoFar = items.filter((i) => new Date(i.dueAt).getTime() < now.getTime());
  const badges: Badge[] = [];

  if (handedIn.length >= 1) badges.push({ icon: "🚀", name: "Lift-off", description: "Handed in your first homework" });
  if (onTime.length >= 3) badges.push({ icon: "⏰", name: "On the clock", description: "3 homeworks handed in on time" });
  if (dueSoFar.length >= 2 && dueSoFar.every((i) => i.submittedAt && i.daysLate === 0)) {
    badges.push({ icon: "🔥", name: "Never late", description: "Every homework so far handed in on time" });
  }
  if (items.some((i) => i.grade && i.grade.quiz_points >= i.quizMax)) {
    badges.push({ icon: "🎯", name: "Quiz master", description: "Full marks on a quiz" });
  }
  if (items.some((i) => i.grade && i.grade.final_points >= 90)) {
    badges.push({ icon: "🌟", name: "Superstar", description: "Scored 90 or more on a homework" });
  }
  if (items.length >= 8 && handedIn.length === items.length) {
    badges.push({ icon: "🏆", name: "Finisher", description: "Handed in every homework of the course" });
  }
  return badges;
}
