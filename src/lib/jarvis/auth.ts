import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_TOKEN_LENGTH = 32;

/**
 * Checks the "Authorization: Bearer <token>" header against JARVIS_API_TOKEN.
 * "disabled" when no (long enough) token is configured, so the API is off by default.
 */
export function checkJarvisToken(header: string | null, configured: string | undefined): "ok" | "denied" | "disabled" {
  const expected = configured?.trim();
  if (!expected || expected.length < MIN_TOKEN_LENGTH) return "disabled";
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? "");
  if (!match) return "denied";
  // Hash both sides so the comparison is constant-time whatever the lengths.
  const a = createHash("sha256").update(match[1].trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? "ok" : "denied";
}
