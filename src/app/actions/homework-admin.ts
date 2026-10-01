"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PARTS } from "@/lib/rules";
import { fromLagosInputs } from "@/lib/time";

export interface FormState {
  ok?: string;
  error?: string;
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function saveHomework(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("admin");
  const id = text(formData, "id");
  const week = Number(text(formData, "week"));
  const title = text(formData, "title");
  const dueAt = fromLagosInputs(text(formData, "due_date"), text(formData, "due_time") || "21:00");

  if (!title) return { error: "Give the homework a title." };
  if (![1, 2, 3, 4].includes(week)) return { error: "Pick a week from 1 to 4." };
  if (!dueAt) return { error: "Pick a due date and time." };

  const row = {
    week,
    title,
    due_at: dueAt.toISOString(),
  };

  if (id) {
    const { error } = await db().from("homeworks").update(row).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/homework");
    revalidatePath(`/admin/homework/${id}`);
    redirect("/admin/homework?done=saved");
  }

  const { data, error } = await db().from("homeworks").insert(row).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/admin/homework");
  redirect(`/admin/homework/${data.id}?done=created`);
}

export async function saveTaskInstructions(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("admin");
  const id = text(formData, "id");
  const { error } = await db()
    .from("homeworks")
    .update({ instructions_a: text(formData, "instructions_a"), instructions_b: text(formData, "instructions_b") })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/homework/${id}`);
  revalidatePath("/admin/homework");
  return { ok: "Task instructions saved." };
}

export async function deleteHomework(formData: FormData) {
  await requireUser("admin");
  const id = text(formData, "id");
  const { error } = await db().from("homeworks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/homework");
  redirect("/admin/homework?done=deleted");
}

export async function saveQuestion(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("admin");
  const id = text(formData, "id");
  const homeworkId = text(formData, "homework_id");
  const type = text(formData, "type");
  const version = text(formData, "version");
  const prompt = text(formData, "prompt");
  // Short answer questions are always worth the fixed short-answer points.
  const points = type === "short" ? PARTS.short : Number(text(formData, "points"));
  const position = Number(text(formData, "position") || "0");

  if (!prompt) return { error: "Write the question." };
  if (type !== "mcq" && type !== "short") return { error: "Pick a question type." };
  if (!["A", "B", "both"].includes(version)) return { error: "Pick which version gets this question." };
  if (!Number.isInteger(points) || points < 1 || points > PARTS.mcq) return { error: `Points must be a whole number from 1 to ${PARTS.mcq}.` };

  const options: string[] = [];
  let correctOption: number | null = null;
  if (type === "mcq") {
    // Keep the original index of each option so "correct" still points at the right one after blanks are dropped.
    const raw = formData.getAll("options").map((o) => String(o).trim());
    const correctRaw = Number(text(formData, "correct_option"));
    for (const [i, option] of raw.entries()) {
      if (!option) continue;
      if (i === correctRaw) correctOption = options.length;
      options.push(option);
    }
    if (options.length < 2) return { error: "Multiple choice needs at least 2 options." };
    if (correctOption === null) return { error: "Tick the correct answer." };
  }

  const row = {
    homework_id: homeworkId,
    type,
    version,
    prompt,
    points,
    position: Number.isFinite(position) ? position : 0,
    options,
    correct_option: correctOption,
  };

  const { error } = id
    ? await db().from("quiz_questions").update(row).eq("id", id)
    : await db().from("quiz_questions").insert(row);
  if (error) return { error: error.message };

  revalidatePath(`/admin/homework/${homeworkId}`);
  return { ok: id ? "Question saved." : "Question added." };
}

export async function deleteQuestion(formData: FormData) {
  await requireUser("admin");
  const id = text(formData, "id");
  const homeworkId = text(formData, "homework_id");
  const { error } = await db().from("quiz_questions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/homework/${homeworkId}`);
}
