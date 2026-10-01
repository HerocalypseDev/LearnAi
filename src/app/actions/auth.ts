"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { createSession, deleteSession, getCurrentUser } from "@/lib/session";
import type { User } from "@/lib/types";

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 15;

// A real bcrypt hash of a random string: comparing against it when the username doesn't exist
// makes a wrong username take as long as a wrong password, so timing doesn't reveal usernames.
const DUMMY_HASH = "$2b$12$zKN9a3e0gO4l1H0eSi8b1uxS0O3m3Yb8nZc1oZQ0b2r6n9wq7oK6y";
const isProd = () => process.env.NODE_ENV === "production";
const GENERIC_ERROR = "Something went wrong. Please try again in a minute.";

export interface LoginState {
  error?: string;
  username?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fail = (error = "That username and password don't match. Try again.") => ({ error, username });

  if (!username || !password) return fail("Type your username and password.");

  let user: User | null;
  try {
    const { data, error } = await db().from("users").select("*").eq("username", username).maybeSingle<User>();
    if (error) throw new Error(error.message);
    user = data;
  } catch (e) {
    // Details go to the server log (Vercel -> Logs); the login page only says what to check in development.
    console.error("login: database error", e);
    return fail(
      isProd()
        ? GENERIC_ERROR
        : `Setup: the app can't reach the database (${e instanceof Error ? e.message : String(e)}). Check SUPABASE_URL and SUPABASE_SECRET_KEY.`,
    );
  }
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return fail(username === "admin" ? "Setup: there is no admin user in the database yet. Run supabase/seed.sql in Supabase." : undefined);
  }

  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString();
  const { count, error: lockError } = await db()
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("event", "login_failed")
    .gte("created_at", since);
  if (lockError || count === null) {
    // Fail closed: if we can't tell whether this account is locked, don't let the attempt through.
    console.error("login: lockout check failed", lockError?.message);
    return fail(GENERIC_ERROR);
  }
  if (count >= MAX_FAILED_ATTEMPTS) {
    return fail(`Too many wrong tries. Wait ${LOCKOUT_MINUTES} minutes and try again.`);
  }

  let passwordHash = user.password_hash;
  let justSetUp = false;

  // First-time admin setup: until the admin has a stored password, the
  // ADMIN_PASSWORD environment variable is accepted and saved (hashed).
  // These setup messages only show until the admin password is first saved (they only
  // reveal that setup isn't finished, which is useful to the teacher during first deploy).
  if (!passwordHash && user.role === "admin") {
    const initial = process.env.ADMIN_PASSWORD?.trim();
    if (!initial) {
      return fail("Setup: ADMIN_PASSWORD is not set in Vercel, or the site hasn't been redeployed since it was added.");
    }
    if (password.trim() !== initial) {
      return fail("Setup: that isn't the ADMIN_PASSWORD saved in Vercel. Check it for typos or extra spaces.");
    }
    passwordHash = await bcrypt.hash(initial, 12);
    const { error } = await db().from("users").update({ password_hash: passwordHash }).eq("id", user.id);
    if (error) {
      console.error("login: saving the first admin password failed", error.message);
      return fail(isProd() ? GENERIC_ERROR : `Setup: couldn't save the admin password: ${error.message}`);
    }
    justSetUp = true;
  }

  if (!passwordHash) {
    return fail("Your password hasn't been set yet. Ask your teacher.");
  }

  if (!justSetUp && !(await bcrypt.compare(password, passwordHash))) {
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
