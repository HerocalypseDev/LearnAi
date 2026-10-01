import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { StatusPill } from "@/components/status-pill";
import { TopBar } from "@/components/top-bar";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/session";
import { loadStudentHomework, type StudentHomework } from "@/lib/student-data";
import { formatDateTime } from "@/lib/time";

const WEEKS = [1, 2, 3, 4];

export default async function DashboardPage() {
  const student = await requireUser("student");
  const [items] = await Promise.all([
    loadStudentHomework(student.id),
    logActivity(student.id, "page_view", { page: "dashboard" }),
  ]);

  const toDo = items.filter((i) => i.status === "upcoming" || i.status === "in_progress");
  const overdue = items.filter((i) => i.status === "missing");
  const done = items.filter((i) => i.status === "submitted" || i.status === "late").reverse();
  const points = items.reduce((sum, i) => sum + (i.grade?.final_points ?? 0), 0);
  const firstName = student.full_name.split(" ")[0];

  return (
    <>
      <TopBar name={student.full_name} home="/dashboard" />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <section>
          <h1 className="text-2xl font-bold">Hi {firstName} 👋</h1>
          <p className="text-slate-500">Homework is due at 9:00pm on Wednesdays and Saturdays.</p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Stat label="Points" value={points} />
          <Stat label="Homework done" value={`${done.length} / ${items.length}`} />
        </section>

        <CourseProgress items={items} />

        <HomeworkList title="Due next" empty="Nothing due right now. 🎉" items={toDo} countdown />
        {overdue.length > 0 && (
          <HomeworkList
            title="Missed — you can still hand these in (late)"
            empty=""
            items={overdue}
          />
        )}
        <HomeworkList title="Handed in" empty="Nothing handed in yet." items={done} />
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function CourseProgress({ items }: { items: StudentHomework[] }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 font-semibold">Course progress</h2>
      <div className="grid grid-cols-4 gap-2">
        {WEEKS.map((week) => {
          const inWeek = items.filter((i) => i.homework.week === week);
          const handedIn = inWeek.filter((i) => i.status === "submitted" || i.status === "late").length;
          const pct = inWeek.length ? Math.round((handedIn / inWeek.length) * 100) : 0;
          return (
            <div key={week}>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-center text-xs text-slate-500">
                Week {week}
                {inWeek.length > 0 && (
                  <span className="block">
                    {handedIn}/{inWeek.length}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HomeworkList({
  title,
  empty,
  items,
  countdown = false,
}: {
  title: string;
  empty: string;
  items: StudentHomework[];
  countdown?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map(({ homework, status, grade }) => (
            <li key={homework.id}>
              <Link
                href={`/homework/${homework.id}`}
                className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-indigo-600">Week {homework.week}</div>
                    <div className="font-semibold">{homework.title}</div>
                    <div className="mt-0.5 text-sm text-slate-500">Due {formatDateTime(homework.due_at)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <StatusPill status={status} />
                    {grade && (
                      <span className="text-sm font-bold text-emerald-700">
                        {grade.final_points} / {homework.max_points}
                      </span>
                    )}
                  </div>
                </div>
                {countdown && <Countdown to={homework.due_at} className="mt-2 block text-sm font-medium" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
