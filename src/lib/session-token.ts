import { SignJWT, jwtVerify } from "jose";

// Signing and checking the login cookie. No database or Next.js request APIs here,
// so the proxy (src/proxy.ts) can use it for a quick "is there a valid session?" check.

export const SESSION_COOKIE = "hw_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const MIN_SESSION_SECRET_LENGTH = 32;

export interface SessionPayload {
  uid: string;
  /** Tail of the password hash: changing a password changes it, which signs out every old cookie. */
  pv: string;
}

export function sessionSecretKey(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be set and at least ${MIN_SESSION_SECRET_LENGTH} characters long.`);
  }
  return new TextEncoder().encode(secret);
}

export function passwordVersion(passwordHash: string): string {
  return passwordHash.slice(-10);
}

/** A session is only valid while the user's current password hash still matches the one it was issued for. */
export function sessionMatchesPassword(payload: SessionPayload, currentPasswordHash: string | null | undefined): boolean {
  return !!currentPasswordHash && passwordVersion(currentPasswordHash) === payload.pv;
}

export async function signSessionToken(payload: SessionPayload, key: Uint8Array = sessionSecretKey()): Promise<string> {
  return new SignJWT({ uid: payload.uid, pv: payload.pv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key);
}

/** The payload of a correctly signed, unexpired token, or null. */
export async function verifySessionToken(token: string, key: Uint8Array = sessionSecretKey()): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, key, { algorithms: ["HS256"] });
    return typeof payload.uid === "string" && typeof payload.pv === "string" ? { uid: payload.uid, pv: payload.pv } : null;
  } catch {
    return null;
  }
}
