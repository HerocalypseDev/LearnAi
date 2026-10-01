import { SubmissionRow } from "@/components/submission-row";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { loadSubmissionSummaries } from "@/lib/marking";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import type { User } from "@/lib/types";
import { PasswordForm } from "./password-form";

export default async function AdminPage() {
  const admin = await requireUser("admin");
  const { data: students, error } = await db()
    .from("users")
    .select("*")
    .eq("role", "student")
    .order("full_name")
    .returns<User[]>();
  if (error) throw new Error(error.message);
  const summaries = await loadSubmissionSummaries();
  const toMark = summaries.filter((s) => s.submission?.status === "submitted" && !s.grade?.released_at);

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
          {(students ?? []).map((s) => (
            <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{s.full_name}</h2>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                  Version {s.version}
                </span>
              </div>
              <dl className="mt-2 space-y-1 text-sm text-slate-600">
                <div>
                  Username: <span className="font-mono text-slate-900">{s.username}</span>
                </div>
                <div>Age: {s.age ?? "—"}</div>
                <div>Last login: {s.last_login_at ? formatDateTime(s.last_login_at) : "never"}</div>
                <div>
                  Password:{" "}
                  {s.password_hash ? (
                    <span className="text-emerald-700">set</span>
                  ) : (
                    <span className="font-semibold text-red-700">not set — they can&apos;t log in yet</span>
                  )}
                </div>
              </dl>
            </div>
          ))}
        </section>

        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div>
            <h2 className="font-semibold">Passwords</h2>
            <p className="text-sm text-slate-500">
              Setting a new password signs that person out on all their devices.
            </p>
          </div>
          {(students ?? []).map((s) => (
            <PasswordForm key={s.id} userId={s.id} label={`${s.full_name} (${s.username})`} />
          ))}
          <PasswordForm userId={admin.id} label="Your admin password" />
        </section>
      </main>
    </>
  );
}
