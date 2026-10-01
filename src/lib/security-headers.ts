// Content-Security-Policy for pages, built per request with a fresh nonce (see src/proxy.ts).

/** The Supabase origin that browsers talk to directly (signed upload/download links). */
export function supabaseOrigin(url = process.env.SUPABASE_URL): string {
  try {
    return url ? new URL(url.trim()).origin : "https://*.supabase.co";
  } catch {
    return "https://*.supabase.co";
  }
}

export function buildCsp({ nonce, supabase, isDev }: { nonce: string; supabase: string; isDev: boolean }): string {
  return [
    "default-src 'self'",
    // Next.js inline scripts carry this nonce; 'strict-dynamic' lets them load the app's chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes (progress bars, chart widths) need 'unsafe-inline'; no nonce here
    // because a nonce would make browsers ignore 'unsafe-inline'.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Production Supabase is always https; skip this for local http testing so uploads still work.
    ...(isDev || supabase.startsWith("http://") ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
