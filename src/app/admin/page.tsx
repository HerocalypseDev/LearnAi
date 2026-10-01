import { GroupedColumns } from "@/components/grouped-columns";
import { SubmissionRow } from "@/components/submission-row";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { loadSubmissionSummaries } from "@/lib/marking";
import { requireUser } from "@/lib/session";
import { loadStats, type StudentStats } from "@/lib/stats";
import { formatDateTime } from "@/lib/time";

// Fixed per child (by version), never by rank. Validated as a pair for colour-blind separation.
const SERIES_COLORS = ["#2a78d6", "#eb6834"];

export default async function AdminPage() {
  await requireUser("admin");
  const [summaries, stats] = await Promise.all([loadSubmissionSummaries(), loadStats()]);
  const toMark = summaries.filter((s) => s.submission?.status === "submitted" && !s.grade?.released_at);
  const categories = stats.homeworks.map((h, i) => `HW${i + 1}`);
  const color = (i: number) => SERIES_COLORS[i] ?? "#6b7280";

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold">Overview</h1>

        <section className="space-y-2">
          <h2 className="font-semibold">Waiting to be marked ({toMark.length})</h2>
          {toMark.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-sm text-slate-500 ring-1 ring-slate-200">Nothing to mark right now.</p>
          ) : (
            toMark.map((item) => <SubmissionRow key={`${item.homework.id}-${item.student.id}`} item={item} showHomework />)
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {stats.students.map((s, i) => (
            <StudentCard key={s.student.id} stats={s} color={color(i)} />
          ))}
        </section>

        <GroupedColumns
          title="Score per homework"
          subtitle="Final score out of 100 once marked (released or not)"
          categories={categories}
          max={100}
          series={stats.students.map((s, i) => ({ name: s.student.full_name, color: color(i), values: s.perHomework.map((h) => h.score) }))}
        />
        <GroupedColumns
          title="Time spent on the quiz"
          subtitle="Minutes, measured while answering questions"
          unit=" min"
          categories={categories}
          series={stats.students.map((s, i) => ({ name: s.student.full_name, color: color(i), values: s.perHomework.map((h) => h.minutes) }))}
        />
        {stats.homeworks.length > 0 && (
          <ol className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
            {stats.homeworks.map((h, i) => (
              <li key={h.id}>
                HW{i + 1} = Week {h.week} · {h.title}
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}

function StudentCard({ stats, color }: { stats: StudentStats; color: string }) {
  const { student } = stats;
  const handedIn = stats.onTime + stats.late;
  const onTimeRate = handedIn ? Math.round((stats.onTime / handedIn) * 100) : null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {student.full_name}
        </h2>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">Version {student.version}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Tile label="Points seen" value={stats.points} />
        <Tile label="Average" value={stats.averageScore ?? "—"} />
        <Tile label="On time" value={onTimeRate === null ? "—" : `${onTimeRate}%`} />
      </dl>
      <dl className="mt-3 space-y-1 text-sm text-slate-600">
        <div>
          Handed in: {stats.onTime} on time · {stats.late} late ·{" "}
          <span className={stats.missing ? "font-semibold text-red-700" : ""}>{stats.missing} missing</span>
        </div>
        <div>
          Attendance: {stats.attendance.present}/{stats.attendance.recorded} Sundays
        </div>
        <div>Last login: {student.last_login_at ? formatDateTime(student.last_login_at) : "never"}</div>
      </dl>
      <p className="mt-2 text-xs text-slate-400">
        Points seen = released scores past their deadline (what {student.full_name} sees). Average = everything you&apos;ve marked.
      </p>
      {stats.badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {stats.badges.map((b) => (
            <span key={b.name} title={b.description} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs ring-1 ring-amber-200">
              {b.icon} {b.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
