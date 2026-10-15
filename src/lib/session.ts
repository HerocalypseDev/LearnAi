import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { timed } from "./perf";
import {
  passwordVersion,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionMatchesPassword,
  signSessionToken,
  verifySessionToken,
} from "./session-token";
import type { Role, User } from "./types";

export { passwordVersion };

export async function createSession(user: Pick<User, "id" | "password_hash">) {
  const token = await signSessionToken({ uid: user.id, pv: passwordVersion(user.password_hash ?? "") });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The correctly signed, unexpired session cookie's payload, or null. No database check: see getCurrentUser. */
const sessionPayload = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
});

/** The logged-in user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const payload = await sessionPayload();
  if (!payload) return null;
  const { data } = await timed("auth:user", () => db().from("users").select("*").eq("id", payload.uid).maybeSingle<User>());
  if (!data || !sessionMatchesPassword(payload, data.password_hash)) return null;
  return data;
});

export async function requireUser(role: Role): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(user.role === "admin" ? "/admin" : "/dashboard");
  return user;
}

/**
 * requireUser(role), with `load(userId)` started at the same time instead of after it: saves one database round
 * trip per page. `load` gets the id from the signed cookie before the user row is checked, so its result is only
 * handed back once requireUser has passed for that same id (a failed check redirects and the data is dropped).
 * Use it only for reads scoped to that id.
 */
export async function requireUserWith<T>(role: Role, load: (userId: string) => Promise<T>): Promise<[User, T]> {
  const payload = await sessionPayload();
  if (!payload) redirect("/login");
  const [user, data] = await Promise.allSettled([requireUser(role), load(payload.uid)]);
  if (user.status === "rejected") throw user.reason; // the redirect to /login or the user's own home
  if (user.value.id !== payload.uid) redirect("/login");
  if (data.status === "rejected") throw data.reason;
  return [user.value, data.value];
}
