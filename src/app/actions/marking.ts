"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as ops from "@/lib/admin-ops";
import { requireUser } from "@/lib/session";

export interface MarkState {
  ok?: string;
  error?: string;
}

/** Save marks. intent: "save" keeps the release state, "release" shows it to the child, "unrelease" hides it again. */
export async function saveMarks(_prev: MarkState, formData: FormData): Promise<MarkState> {
  await requireUser("admin");
  const homeworkId = String(formData.get("homework_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const intent = String(formData.get("intent") ?? "save");

  const shortPoints: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) if (key.startsWith("q_")) shortPoints[key.slice(2)] = value;

  try {
    await ops.saveMarks({
      homeworkId,
      studentId,
      shortPoints,
      taskPoints: formData.get("task_points") ?? 0,
      comment: formData.get("comment") ?? "",
      release: intent === "release" ? "release" : intent === "unrelease" ? "hide" : "keep",
      markedBy: "admin",
    });
  } catch (e) {
    if (e instanceof ops.OpError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/admin/homework/${homeworkId}`);
  revalidatePath("/admin");
  const done = intent === "release" ? "released" : intent === "unrelease" ? "hidden" : "marks-saved";
  redirect(`/admin/homework/${homeworkId}?done=${done}`);
}
