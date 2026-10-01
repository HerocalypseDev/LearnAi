import Link from "next/link";
import { ADMIN_LINKS, TopBar } from "@/components/top-bar";
import { cardClass } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { versionNames } from "@/lib/student-data";
import { HomeworkForm } from "../homework-form";

export default async function NewHomeworkPage() {
  await requireUser("admin");
  const names = await versionNames();

  return (
    <>
      <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <Link href="/admin/homework" className="text-sm text-indigo-600 hover:underline">
          ← All homework
        </Link>
        <h1 className="text-2xl font-bold">New homework</h1>
        <section className={cardClass}>
          <HomeworkForm
            names={names}
            values={{ week: 1, title: "", due_date: "", due_time: "21:00", instructions_a: "", instructions_b: "" }}
          />
        </section>
        <p className="text-sm text-slate-500">You can add quiz questions after creating the homework.</p>
      </main>
    </>
  );
}
