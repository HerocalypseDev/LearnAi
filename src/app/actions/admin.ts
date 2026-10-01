"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createSession, requireUser } from "@/lib/session";

export interface PasswordState {
  ok?: string;
  error?: string;
}

const MIN_LENGTH = 6;

export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const admin = await requireUser("admin");
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < MIN_LENGTH) return { error: `Use at least ${MIN_LENGTH} characters.` };

  const { data: target } = await db().from("users").select("id, full_name, role").eq("id", userId).maybeSingle();
  if (!target) return { error: "User not found." };

  const passwordHash = await bcrypt.hash(password, 12);
  const { error } = await db().from("users").update({ password_hash: passwordHash }).eq("id", userId);
  if (error) return { error: "Could not save the password. Try again." };

  // Changing your own password signs out old sessions, including this one, so refresh it.
  if (target.id === admin.id) await createSession({ id: admin.id, password_hash: passwordHash });

  revalidatePath("/admin");
  return { ok: `Password saved for ${target.full_name}.` };
}
