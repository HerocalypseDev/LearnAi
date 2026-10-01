"use server";

import { revalidatePath } from "next/cache";
import * as ops from "@/lib/admin-ops";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export interface AttendanceState {
  ok?: string;
  error?: string;
}

export async function saveAttendance(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await requireUser("admin");
  const date = String(formData.get("date") ?? "");

  const { data: students } = await db().from("users").select("id").eq("role", "student");
  try {
    for (const { id } of students ?? []) {
      const mark = String(formData.get(`present_${id}`) ?? "");
      await ops.setAttendance({
        studentId: id,
        date,
        present: mark === "yes" ? true : mark === "no" ? false : null,
        note: formData.get(`note_${id}`),
      });
    }
  } catch (e) {
    if (e instanceof ops.OpError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/attendance");
  revalidatePath("/admin");
  return { ok: "Saved." };
}
