import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { db } from "./db";
import { timed } from "./perf";
import { describeBrowser, describeDevice } from "./user-agent";
import type { ActivityEvent } from "./types";

async function insertActivity(userId: string, event: ActivityEvent, detail: Record<string, unknown>, ua: string) {
  const { error } = await timed("activity:insert", () =>
    db().from("activity_log").insert({
      user_id: userId,
      event,
      detail,
      device: describeDevice(ua),
      browser: describeBrowser(ua),
    }),
  );
  if (error) console.error("activity_log insert failed", error.message);
}

const logFailure = (err: unknown) =>
  console.error("activity_log insert failed", err instanceof Error ? err.message : "unknown error");

/** Writes one activity row and waits for it. Never throws: a failed log line must not break what wrote it. */
export async function logActivity(userId: string, event: ActivityEvent, detail: Record<string, unknown> = {}) {
  try {
    await insertActivity(userId, event, detail, (await headers()).get("user-agent") ?? "");
  } catch (err) {
    logFailure(err);
  }
}

/**
 * Same row, written with Next's after() once the response has been sent: student page views, autosaves and
 * uploads. The user agent is read now, because a server component's after() callback can't read headers.
 * Logins and admin actions keep awaiting logActivity so their trail is written before the response.
 */
export function logActivityInBackground(userId: string, event: ActivityEvent, detail: Record<string, unknown> = {}) {
  const ua = headers().then((h) => h.get("user-agent") ?? "");
  ua.catch(() => {}); // a failure is reported by the callback below
  after(async () => {
    try {
      await insertActivity(userId, event, detail, await ua);
    } catch (err) {
      logFailure(err);
    }
  });
}
