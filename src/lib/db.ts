import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Server-only Supabase client using the secret key. Every table has RLS on
// with no policies, so this key is the only way in; it must never reach the browser.
export function db(): SupabaseClient {
  if (client) return client;
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variable.");
  }
  // Keep only https://xxxx.supabase.co, in case the copied URL ends in /rest/v1/.
  const url = new URL(rawUrl).origin;
  client = createClient(url, key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
