"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { createSession, deleteSession, getCurrentUser } from "@/lib/session";
import type { User } from "@/lib/types";

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 15;

export interface LoginState {
  error?: string;
  username?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fail = (error = "That username and password don't match. Try again.") => ({ error, username });

  if (!username || !password) return fail("Type your username and password.");

  const { data: user } = await db().from("users").select("*").eq("username", username).maybeSingle<User>();
  if (!user) return fail();

  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString();
  const { count } = await db()
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("event", "login_failed")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_FAILED_ATTEMPTS) {
    return fail(`Too many wrong tries. Wait ${LOCKOUT_MINUTES} minutes and try again.`);
  }

  let passwordHash = user.password_hash;

  // First-time admin setup: until the admin has a stored password, the
  // ADMIN_PASSWORD environment variable is accepted and saved (hashed).
  if (!passwordHash && user.role === "admin") {
    const initial = process.env.ADMIN_PASSWORD;
    if (initial && password === initial) {
      passwordHash = await bcrypt.hash(password, 12);
      await db().from("users").update({ password_hash: passwordHash }).eq("id", user.id);
    }
  }

  if (!passwordHash) {
    return fail(user.role === "student" ? "Your password hasn't been set yet. Ask your teacher." : undefined);
  }

  if (!(await bcrypt.compare(password, passwordHash))) {
    await logActivity(user.id, "login_failed");
    return fail();
  }

  await db().from("users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);
  await logActivity(user.id, "login");
  await createSession({ id: user.id, password_hash: passwordHash });
  redirect(user.role === "admin" ? "/admin" : "/dashboard");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await logActivity(user.id, "logout");
  await deleteSession();
  redirect("/login");
}
