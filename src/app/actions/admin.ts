"use server";

import { revalidatePath } from "next/cache";
import * as ops from "@/lib/admin-ops";
import { createSession, requireUser } from "@/lib/session";

export interface PasswordState {
  ok?: string;
  error?: string;
}

export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const admin = await requireUser("admin");
  try {
    const target = await ops.setUserPassword(formData.get("userId"), formData.get("password"));
    // Changing your own password signs out old sessions, including this one, so refresh it.
    if (target.id === admin.id) await createSession({ id: admin.id, password_hash: target.password_hash });
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    return { ok: `Password saved for ${target.full_name}.` };
  } catch (e) {
    if (e instanceof ops.OpError) return { error: e.message };
    throw e;
  }
}

export async function saveSettings(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  await requireUser("admin");
  try {
    await ops.updateSettings(formData.get("late_penalty_per_day"), formData.get("late_penalty_cap"));
  } catch (e) {
    if (e instanceof ops.OpError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/settings");
  return { ok: "Saved. New marking uses these numbers; re-save a marked homework to apply them to it." };
}
