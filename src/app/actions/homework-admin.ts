"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as ops from "@/lib/admin-ops";
import { requireUser } from "@/lib/session";

export interface FormState {
  ok?: string;
  error?: string;
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const fail = (e: unknown): FormState => {
  if (e instanceof ops.OpError) return { error: e.message };
  throw e;
};

export async function saveHomework(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("admin");
  const id = text(formData, "id");
  const input = {
    week: text(formData, "week"),
    title: text(formData, "title"),
    due_date: text(formData, "due_date"),
    due_time: text(formData, "due_time") || "21:00",
  };
  let target: string;
  try {
    if (id) {
      await ops.updateHomework(id, input);
      revalidatePath(`/admin/homework/${id}`);
      target = "/admin/homework?done=saved";
    } else {
      const created = await ops.createHomework(input);
      target = `/admin/homework/${created.id}?done=created`;
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/homework");
  redirect(target);
}

export async function saveTaskInstructions(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("admin");
  const id = text(formData, "id");
  const input: ops.HomeworkInput = {
    instructions_a: text(formData, "instructions_a"),
    instructions_b: text(formData, "instructions_b"),
  };
  if (formData.has("marking_notes")) input.marking_notes = text(formData, "marking_notes");
  try {
    await ops.updateHomework(id, input);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/admin/homework/${id}`);
  revalidatePath("/admin/homework");
  return { ok: "Task saved." };
}

export async function deleteHomework(formData: FormData) {
  await requireUser("admin");
  await ops.deleteHomework(text(formData, "id"));
  revalidatePath("/admin/homework");
  redirect("/admin/homework?done=deleted");
}

export async function saveQuestion(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("admin");
  const id = text(formData, "id");
  try {
    const q = await ops.saveQuestion({
      id: id || undefined,
      homework_id: text(formData, "homework_id"),
      type: text(formData, "type"),
      version: text(formData, "version"),
      prompt: text(formData, "prompt"),
      points: text(formData, "points"),
      position: text(formData, "position"),
      options: formData.getAll("options").map(String),
      correct_option: text(formData, "correct_option"),
    });
    revalidatePath(`/admin/homework/${q.homework_id}`);
  } catch (e) {
    return fail(e);
  }
  return { ok: id ? "Question saved." : "Question added." };
}

export async function deleteQuestion(formData: FormData) {
  await requireUser("admin");
  const { homework_id } = await ops.deleteQuestion(text(formData, "id"));
  revalidatePath(`/admin/homework/${homework_id}`);
}
