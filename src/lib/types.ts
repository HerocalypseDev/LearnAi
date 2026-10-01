export type Role = "admin" | "student";
export type Version = "A" | "B";

export interface User {
  id: string;
  full_name: string;
  username: string;
  age: number | null;
  password_hash: string | null;
  role: Role;
  version: Version | null;
  last_login_at: string | null;
}

export interface Homework {
  id: string;
  week: number;
  title: string;
  due_at: string;
  instructions_a: string;
  instructions_b: string;
  max_points: number;
  quiz_points: number;
  task_points: number;
  /** Admin-only notes Jarvis uses when marking (never shown to the kids). Missing until the Jarvis migration runs. */
  marking_notes?: string | null;
}

export interface Submission {
  id: string;
  homework_id: string;
  student_id: string;
  status: "draft" | "submitted";
  started_at: string;
  submitted_at: string | null;
  days_late: number;
}

export interface Grade {
  id: string;
  submission_id: string;
  quiz_points: number;
  task_points: number;
  late_penalty: number;
  final_points: number;
  comment: string | null;
  released_at: string | null;
  /** Who saved the marks: "admin" or "jarvis". Missing until the Jarvis migration runs. */
  marked_by?: string | null;
}

export interface Settings {
  late_penalty_per_day: number;
  late_penalty_cap: number;
}

export type ActivityEvent =
  | "login"
  | "login_failed"
  | "logout"
  | "page_view"
  | "quiz_start"
  | "answer_change"
  | "upload"
  | "submit"
  | "view_feedback"
  | "admin_action";

export interface QuizQuestion {
  id: string;
  homework_id: string;
  version: "A" | "B" | "both";
  type: "mcq" | "short";
  prompt: string;
  options: string[];
  correct_option: number | null;
  points: number;
  position: number;
}

/** What a student is allowed to see of a question: no correct answer. */
export type StudentQuestion = Omit<QuizQuestion, "correct_option" | "homework_id">;

export interface Answer {
  id: string;
  submission_id: string;
  question_id: string;
  answer_text: string | null;
  selected_option: number | null;
  auto_points: number | null;
  manual_points: number | null;
  updated_at: string;
}

export interface Upload {
  id: string;
  submission_id: string;
  file_name: string;
  file_type: string | null;
  size_bytes: number;
  storage_path: string;
  uploaded_at: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  sunday_date: string;
  present: boolean;
  note: string | null;
}
