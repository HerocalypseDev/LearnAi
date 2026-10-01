import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
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

/** The logged-in user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const { data } = await db().from("users").select("*").eq("id", payload.uid).maybeSingle<User>();
  if (!data || !sessionMatchesPassword(payload, data.password_hash)) return null;
  return data;
});

export async function requireUser(role: Role): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(user.role === "admin" ? "/admin" : "/dashboard");
  return user;
}
