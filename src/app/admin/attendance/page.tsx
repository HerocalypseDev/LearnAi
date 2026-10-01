import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { CLASS_SUNDAYS } from "@/lib/course";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/time";
import type { Attendance, User } from "@/lib/types";
import { AttendanceForm } from "./attendance-form";

export default async function AttendancePage() {
  await requireUser("admin");
  const [{ data: students }, { data: records }] = await Promise.all([
    db().from("users").select("id, full_name").eq("role", "student").order("full_name").returns<Pick<User, "id" | "full_name">[]>(),
    db().from("attendance").select("*").returns<Attendance[]>(),
  ]);
  // Class Sundays plus any other date that already has a record.
  const dates = [...new Set([...CLASS_SUNDAYS, ...(records ?? []).map((r) => r.sunday_date)])].sort();

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">Attendance</h1>
        <section className="grid gap-2 sm:grid-cols-2">
          {(students ?? []).map((s) => {
            const mine = (records ?? []).filter((r) => r.student_id === s.id);
            return (
              <div key={s.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                <span className="font-semibold">{s.full_name}</span>: present {mine.filter((r) => r.present).length} of {mine.length} recorded
              </div>
            );
          })}
        </section>
        {dates.map((date) => (
          <AttendanceForm
            key={date}
            date={date}
            label={`${CLASS_SUNDAYS.includes(date) ? `Week ${CLASS_SUNDAYS.indexOf(date) + 1} · ` : ""}${formatDate(`${date}T12:00:00+01:00`)}`}
            rows={(students ?? []).map((s) => {
              const r = records?.find((x) => x.student_id === s.id && x.sunday_date === date);
              return { studentId: s.id, name: s.full_name, present: r ? r.present : null, note: r?.note ?? "" };
            })}
          />
        ))}
      </main>
    </>
  );
}
