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

/** Extension without trailing dots/spaces, which Windows ignores ("setup.exe." and "setup.exe " are setup.exe). */
export function fileExtension(name: string): string {
  const trimmed = name.replace(/[.\s]+$/, "");
  const dot = trimmed.lastIndexOf(".");
  return dot === -1 ? "" : trimmed.slice(dot + 1).toLowerCase();
}

/** Returns a child-friendly error, or null if the file is allowed. */
export function checkUpload(name: string, sizeBytes: number, filesAlready: number): string | null {
  if (filesAlready >= MAX_FILES) return `You can attach up to ${MAX_FILES} files.`;
  if (BLOCKED_EXTENSIONS.includes(fileExtension(name))) return `"${name}" is a program file, which isn't allowed.`;
  if (sizeBytes <= 0) return `"${name}" is empty.`;
  if (sizeBytes > MAX_FILE_BYTES) return `"${name}" is bigger than 20MB.`;
  return null;
}

/**
 * Final check when an upload is confirmed. `size` is what the storage service actually holds (null = unknown).
 * Both the name the browser reported and the name the object was stored under must be allowed.
 */
export function checkStoredUpload(
  reportedName: string,
  storedName: string,
  size: number | null,
  filesAlready: number,
): { problem: string; retryable: boolean } | null {
  if (size === null || !Number.isFinite(size)) {
    return { problem: "We couldn't check that file yet. Wait a moment and try again.", retryable: true };
  }
  const problem = checkUpload(reportedName, size, filesAlready) ?? checkUpload(storedName, size, filesAlready);
  return problem ? { problem, retryable: false } : null;
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

/** Quiz total from the questions as they are NOW (never from stored auto_points), capped at the quiz maximum. */
export function quizScore(
  questions: { id: string; type: "mcq" | "short"; correct_option: number | null; points: number }[],
  picks: Record<string, { selected_option: number | null; manual_points: number | null } | undefined>,
  quizMax: number = PARTS.mcq + PARTS.short,
) {
  let mcq = 0;
  let short = 0;
  for (const q of questions) {
    const pick = picks[q.id];
    if (q.type === "mcq") mcq += autoPoints(q, pick?.selected_option ?? null) ?? 0;
    else short += pick?.manual_points ?? 0;
  }
  return { mcq, short, total: Math.min(mcq + short, quizMax) };
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

// ---- Passwords ----

/** Kids type their password on a phone, so theirs can be short; the admin account controls everything. */
export const MIN_PASSWORD_LENGTH = { student: 6, admin: 10 } as const;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores anything after 72 bytes

export function passwordProblem(password: string, role: "admin" | "student"): string | null {
  const min = MIN_PASSWORD_LENGTH[role];
  if (password.length < min) return `Use at least ${min} characters${role === "admin" ? " for the admin password" : ""}.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

// ---- Question validation ----

/** Drop blank options and re-point the correct answer at the remaining list. */
export function normalizeMcq(
  rawOptions: unknown[],
  correctRaw: unknown,
): { options: string[]; correct: number } | { error: string } {
  const picked = correctRaw === null || correctRaw === undefined || correctRaw === "" ? NaN : Number(correctRaw);
  const options: string[] = [];
  let correct: number | null = null;
  rawOptions.forEach((o, i) => {
    const text = String(o ?? "").trim();
    if (!text) return;
    if (i === picked) correct = options.length;
    options.push(text.slice(0, 300));
  });
  if (options.length < 2) return { error: "Multiple choice needs at least 2 options." };
  if (options.length > 6) return { error: "Multiple choice can have at most 6 options." };
  if (correct === null) return { error: "Say which option is correct (correct_option, counting from 0)." };
  return { options, correct };
}

/**
 * Would adding/changing this question push a version over its budget? `others` are the homework's other
 * questions (leave out the one being edited). Multiple choice: at most PARTS.mcq per version.
 * Short answer: at most PARTS.short per version (one question, since each is worth PARTS.short).
 */
export function checkQuestionBudget(
  others: { version: "A" | "B" | "both"; type: "mcq" | "short"; points: number }[],
  candidate: { version: "A" | "B" | "both"; type: "mcq" | "short"; points: number },
): string | null {
  const versions: ("A" | "B")[] = candidate.version === "both" ? ["A", "B"] : [candidate.version];
  for (const v of versions) {
    const mine = others.filter((q) => q.version === v || q.version === "both");
    const totals = quizTotals(mine);
    if (candidate.type === "mcq" && totals.mcq + candidate.points > PARTS.mcq) {
      return `Multiple choice for version ${v} would be ${totals.mcq + candidate.points} points, but it is ${PARTS.mcq} in total. ${
        PARTS.mcq - totals.mcq > 0 ? `Only ${PARTS.mcq - totals.mcq} left.` : "It is already full."
      }`;
    }
    if (candidate.type === "short" && totals.short + candidate.points > PARTS.short) {
      return `Version ${v} already has its short answer question (${PARTS.short} points).`;
    }
  }
  return null;
}
