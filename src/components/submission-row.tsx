import Link from "next/link";
import type { SubmissionSummary } from "@/lib/marking";
import { formatDateTime, isPast } from "@/lib/time";
import { linkCardClass } from "./ui";

/** One child's state for one homework, linking to the marking page. */
export function SubmissionRow({ item, showHomework = false }: { item: SubmissionSummary; showHomework?: boolean }) {
  const { student, homework, submission, grade } = item;
  const overdue = isPast(homework.due_at);

  let status: { text: string; className: string };
  if (submission?.status === "submitted") {
    status = grade?.released_at
      ? { text: `Released · ${grade.final_points}/100`, className: "bg-emerald-100 text-emerald-800" }
      : grade
        ? { text: `Marked · ${grade.final_points}/100 (not released)`, className: "bg-sky-100 text-sky-800" }
        : { text: submission.days_late > 0 ? `To mark · ${submission.days_late}d late` : "To mark", className: "bg-amber-100 text-amber-800" };
  } else if (submission) {
    status = overdue ? { text: "Started, missing", className: "bg-red-100 text-red-800" } : { text: "Working on it", className: "bg-slate-100 text-slate-700" };
  } else {
    status = overdue ? { text: "Missing", className: "bg-red-100 text-red-800" } : { text: "Not started", className: "bg-slate-100 text-slate-700" };
  }

  return (
    <Link
      href={`/admin/homework/${homework.id}/mark/${student.id}`}
      className={`${linkCardClass} flex items-center justify-between gap-3`}
    >
      <div className="min-w-0">
        <div className="font-medium">
          {student.full_name}
          {showHomework && <span className="font-normal text-slate-500"> · {homework.title}</span>}
        </div>
        <div className="text-xs text-slate-500">
          {submission?.submitted_at ? `Handed in ${formatDateTime(submission.submitted_at)}` : `Due ${formatDateTime(homework.due_at)}`}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        {grade?.marked_by === "jarvis" && (
          <span title="Marked by Jarvis" className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-800 ring-1 ring-cyan-200">
            🤖 Jarvis
          </span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.text}</span>
        <span className="text-indigo-400 transition group-hover:translate-x-1 group-hover:text-indigo-600" aria-hidden="true">
          →
        </span>
      </span>
    </Link>
  );
}
