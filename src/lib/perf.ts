import "server-only";

/**
 * Times one server-side step (a Supabase query, a Storage call) and, in production, logs one JSON line:
 * {"type":"db_timing","label":"homework:answers","ms":42}. Labels are fixed strings: never put ids, names,
 * answers, tokens or file contents in them. Accepts Supabase's query builders, which are thenables.
 */
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    if (process.env.NODE_ENV === "production") {
      console.info(JSON.stringify({ type: "db_timing", label, ms: Math.round(performance.now() - started) }));
    }
  }
}
