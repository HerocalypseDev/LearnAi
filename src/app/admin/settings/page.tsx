import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { cardClass } from "@/components/ui";
import { db } from "@/lib/db";
import { MIN_TOKEN_LENGTH } from "@/lib/jarvis/auth";
import { DEFAULT_PENALTY, MIN_PASSWORD_LENGTH } from "@/lib/rules";
import { requireUser } from "@/lib/session";
import type { Settings, User } from "@/lib/types";
import { PasswordForm } from "./password-form";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const admin = await requireUser("admin");
  const jarvisOn = (process.env.JARVIS_API_TOKEN?.trim().length ?? 0) >= MIN_TOKEN_LENGTH;
  const jarvisReadOnly = process.env.JARVIS_API_READ_ONLY === "1";
  const [{ data: students }, { data: settings }] = await Promise.all([
    db().from("users").select("*").eq("role", "student").order("full_name").returns<User[]>(),
    db().from("settings").select("late_penalty_per_day, late_penalty_cap").eq("id", 1).maybeSingle<Settings>(),
  ]);

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="stagger mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        <section className={`${cardClass} space-y-3`}>
          <div>
            <h2 className="font-semibold">Late penalty</h2>
            <p className="text-sm text-slate-500">Points lost for each started day after the 21:00 deadline, up to the cap.</p>
          </div>
          <SettingsForm
            perDay={settings?.late_penalty_per_day ?? DEFAULT_PENALTY.perDay}
            cap={settings?.late_penalty_cap ?? DEFAULT_PENALTY.cap}
          />
        </section>

        <section className={`${cardClass} space-y-2`}>
          <h2 className="font-semibold">🤖 Jarvis</h2>
          {jarvisOn ? (
            <p className="text-sm text-emerald-700">
              Connected: Jarvis can {jarvisReadOnly ? "read everything but change nothing (read-only mode)" : "do everything you can do here"}. Its
              changes show in Activity under “🤖 Jarvis”.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Off. To turn it on, add <code className="rounded bg-slate-100 px-1">JARVIS_API_TOKEN</code> (a random 32+ character secret) in
              Vercel and redeploy. Delete it to cut Jarvis off instantly.
            </p>
          )}
        </section>

        <section className={`${cardClass} space-y-4`}>
          <div>
            <h2 className="font-semibold">Passwords</h2>
            <p className="text-sm text-slate-500">Setting a new password signs that person out on all their devices.</p>
          </div>
          {(students ?? []).map((s) => (
            <div key={s.id}>
              <PasswordForm userId={s.id} label={`${s.full_name} (username: ${s.username})`} minLength={MIN_PASSWORD_LENGTH.student} />
              {!s.password_hash && <p className="mt-1 text-xs font-semibold text-red-700">No password yet, so {s.full_name} can&apos;t log in.</p>}
            </div>
          ))}
          <PasswordForm userId={admin.id} label="Your admin password (at least 10 characters)" minLength={MIN_PASSWORD_LENGTH.admin} />
        </section>
      </main>
    </>
  );
}
