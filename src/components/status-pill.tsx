import type { HomeworkStatus } from "@/lib/rules";

const STYLES: Record<HomeworkStatus, { label: string; className: string }> = {
  upcoming: { label: "To do", className: "bg-sky-100 text-sky-800" },
  in_progress: { label: "Started", className: "bg-amber-100 text-amber-800" },
  missing: { label: "Missing", className: "bg-red-100 text-red-800" },
  submitted: { label: "Submitted", className: "bg-emerald-100 text-emerald-800" },
  late: { label: "Submitted late", className: "bg-orange-100 text-orange-800" },
};

export function StatusPill({ status }: { status: HomeworkStatus }) {
  const { label, className } = STYLES[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{label}</span>;
}
