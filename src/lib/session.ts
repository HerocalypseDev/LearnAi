import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import type { Role, User } from "./types";

const COOKIE = "hw_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface SessionPayload {
  uid: string;
  // Tail of the password hash. Changing a password changes it, which signs out
  // every device still holding an old cookie.
  pv: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long.");
  }
  return new TextEncoder().encode(secret);
}

export function passwordVersion(passwordHash: string): string {
  return passwordHash.slice(-10);
}

export async function createSession(user: Pick<User, "id" | "password_hash">) {
  const token = await new SignJWT({ uid: user.id, pv: passwordVersion(user.password_hash ?? "") })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE);
}

async function readPayload(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, secretKey(), { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

/** The logged-in user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const payload = await readPayload();
  if (!payload) return null;
  const { data } = await db().from("users").select("*").eq("id", payload.uid).maybeSingle<User>();
  if (!data?.password_hash || passwordVersion(data.password_hash) !== payload.pv) return null;
  return data;
});

export async function requireUser(role: Role): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(user.role === "admin" ? "/admin" : "/dashboard");
  return user;
}
