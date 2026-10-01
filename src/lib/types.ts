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
  | "view_feedback";
