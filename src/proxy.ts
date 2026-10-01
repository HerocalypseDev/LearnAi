import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, supabaseOrigin } from "@/lib/security-headers";
import { SESSION_COOKIE, sessionSecretKey, verifySessionToken } from "@/lib/session-token";

// Runs before every page request (not /api, not static files):
//  1. a per-request CSP nonce, which Next.js applies to its own scripts;
//  2. an optimistic sign-in check: no valid session cookie on a private page -> /login.
//     Pages still do the full check (user exists, role, password not changed) with requireUser().

const PRIVATE_PREFIXES = ["/admin", "/dashboard", "/homework"];

const isPrivate = (path: string) => PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

async function hasValidSession(req: NextRequest): Promise<boolean | "unknown"> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  let key: Uint8Array;
  try {
    key = sessionSecretKey();
  } catch {
    return "unknown"; // misconfigured secret: let the page show the real error
  }
  return (await verifySessionToken(token, key)) !== null;
}

export async function proxy(req: NextRequest) {
  if (isPrivate(req.nextUrl.pathname) && (await hasValidSession(req)) === false) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({ nonce, supabase: supabaseOrigin(), isDev: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
