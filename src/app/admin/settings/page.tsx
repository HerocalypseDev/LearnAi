import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { cardClass } from "@/components/ui";
import { db } from "@/lib/db";
import { DEFAULT_PENALTY } from "@/lib/rules";
import { requireUser } from "@/lib/session";
import type { Settings, User } from "@/lib/types";
import { PasswordForm } from "./password-form";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const admin = await requireUser("admin");
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

        <section className={`${cardClass} space-y-4`}>
          <div>
            <h2 className="font-semibold">Passwords</h2>
            <p className="text-sm text-slate-500">Setting a new password signs that person out on all their devices.</p>
          </div>
          {(students ?? []).map((s) => (
            <div key={s.id}>
              <PasswordForm userId={s.id} label={`${s.full_name} (username: ${s.username})`} />
              {!s.password_hash && <p className="mt-1 text-xs font-semibold text-red-700">No password yet, so {s.full_name} can&apos;t log in.</p>}
            </div>
          ))}
          <PasswordForm userId={admin.id} label="Your admin password" />
        </section>
      </main>
    </>
  );
}
