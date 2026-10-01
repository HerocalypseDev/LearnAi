import Link from "next/link";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { cardClass, secondaryButtonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime, TIME_ZONE } from "@/lib/time";
import type { User } from "@/lib/types";

const EVENTS: Record<string, string> = {
  login: "Logged in",
  login_failed: "Wrong password",
  logout: "Logged out",
  page_view: "Opened a page",
  quiz_start: "Started homework",
  answer_change: "Answer saved",
  upload: "File",
  submit: "Handed in",
  view_feedback: "Viewed result",
};
const LIMIT = 300;

interface Row {
  id: number;
  user_id: string;
  event: string;
  detail: Record<string, unknown>;
  device: string | null;
  browser: string | null;
  created_at: string;
}

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireUser("admin");
  const params = await searchParams;
  const studentFilter = typeof params.student === "string" ? params.student : "";
  const eventFilter = typeof params.event === "string" && params.event in EVENTS ? params.event : "";

  const [{ data: students }, { data: homeworks }] = await Promise.all([
    db().from("users").select("id, full_name").eq("role", "student").order("full_name").returns<Pick<User, "id" | "full_name">[]>(),
    db().from("homeworks").select("id, title").returns<{ id: string; title: string }[]>(),
  ]);
  const ids = (students ?? []).map((s) => s.id);

  let query = db().from("activity_log").select("*").order("created_at", { ascending: false }).limit(LIMIT);
  query = studentFilter && ids.includes(studentFilter) ? query.eq("user_id", studentFilter) : query.in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (eventFilter) query = query.eq("event", eventFilter);
  const { data: rows } = await query.returns<Row[]>();

  const name = (id: string) => students?.find((s) => s.id === id)?.full_name ?? "?";
  const hwTitle = (id: unknown) => homeworks?.find((h) => h.id === id)?.title;
  const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(iso));
  const days = [...new Set((rows ?? []).map((r) => dayKey(r.created_at)))];

  const filterLink = (next: { student?: string; event?: string }) => {
    const q = new URLSearchParams();
    const s = next.student ?? studentFilter;
    const e = next.event ?? eventFilter;
    if (s) q.set("student", s);
    if (e) q.set("event", e);
    return `/admin/activity${q.size ? `?${q}` : ""}`;
  };
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1 text-xs ring-1 ${active ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-700 ring-slate-300"}`;

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Activity</h1>
          <div className="flex flex-wrap gap-2">
            <a href="/admin/export/activity.csv" className={secondaryButtonClass}>
              ⬇ Activity CSV
            </a>
            <a href="/admin/export/scores.csv" className={secondaryButtonClass}>
              ⬇ Scores CSV
            </a>
            <a href="/admin/export/attendance.csv" className={secondaryButtonClass}>
              ⬇ Attendance CSV
            </a>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Link href={filterLink({ student: "" })} className={chip(!studentFilter)}>
              Both
            </Link>
            {(students ?? []).map((s) => (
              <Link key={s.id} href={filterLink({ student: s.id })} className={chip(studentFilter === s.id)}>
                {s.full_name}
              </Link>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Link href={filterLink({ event: "" })} className={chip(!eventFilter)}>
              Everything
            </Link>
            {Object.entries(EVENTS).map(([key, label]) => (
              <Link key={key} href={filterLink({ event: key })} className={chip(eventFilter === key)}>
                {label}
              </Link>
            ))}
          </div>
        </div>

        {days.length === 0 && <p className={`${cardClass} text-sm text-slate-500`}>No activity yet.</p>}
        {days.map((day) => (
          <section key={day} className={cardClass}>
            <h2 className="mb-2 font-semibold">{formatDate(`${day}T12:00:00+01:00`)}</h2>
            <ol className="space-y-1.5 text-sm">
              {(rows ?? [])
                .filter((r) => dayKey(r.created_at) === day)
                .map((r) => (
                  <li key={r.id} className="grid grid-cols-[3.5rem_1fr] gap-2">
                    <span className="tabular-nums text-slate-500">{formatDateTime(r.created_at).split(", ").pop()}</span>
                    <span>
                      <span className="font-medium">{name(r.user_id)}</span> · {EVENTS[r.event] ?? r.event}
                      <Detail row={r} hwTitle={hwTitle(r.detail.homework_id)} />
                      <span className="block text-xs text-slate-400">
                        {r.device} · {r.browser}
                      </span>
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        ))}
        {(rows ?? []).length === LIMIT && (
          <p className="text-center text-xs text-slate-500">Showing the latest {LIMIT}. Download the CSV for everything.</p>
        )}
      </main>
    </>
  );
}

function Detail({ row, hwTitle }: { row: Row; hwTitle?: string }) {
  const d = row.detail;
  const parts: string[] = [];
  if (hwTitle) parts.push(hwTitle);
  if (typeof d.page === "string" && d.page !== "homework") parts.push(d.page);
  if (row.event === "upload") parts.push(`${d.removed ? "removed" : "added"} ${String(d.file_name ?? "")}`);
  if (row.event === "answer_change" && Number(d.active_ms) > 0) parts.push(`${Math.round(Number(d.active_ms) / 1000)}s on question`);
  if (row.event === "answer_change" && typeof d.length === "number") parts.push(`${d.length} characters`);
  if (row.event === "submit" && Number(d.days_late) > 0) parts.push(`${d.days_late} day(s) late`);
  if (parts.length === 0) return null;
  return <span className="text-slate-600"> — {parts.join(" · ")}</span>;
}
