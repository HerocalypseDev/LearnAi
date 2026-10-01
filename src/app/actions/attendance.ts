"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export interface AttendanceState {
  ok?: string;
  error?: string;
}

export async function saveAttendance(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await requireUser("admin");
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };

  const { data: students } = await db().from("users").select("id").eq("role", "student");
  for (const { id } of students ?? []) {
    const mark = String(formData.get(`present_${id}`) ?? "");
    const note = String(formData.get(`note_${id}`) ?? "").trim().slice(0, 500) || null;
    const { error } =
      mark === "yes" || mark === "no"
        ? await db()
            .from("attendance")
            .upsert({ student_id: id, sunday_date: date, present: mark === "yes", note }, { onConflict: "student_id,sunday_date" })
        : await db().from("attendance").delete().eq("student_id", id).eq("sunday_date", date);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/attendance");
  revalidatePath("/admin");
  return { ok: "Saved." };
}
