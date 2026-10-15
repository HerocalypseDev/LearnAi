import "server-only";
import { waitUntil } from "@vercel/functions";
import { headers } from "next/headers";
import { db } from "./db";
import { timed } from "./perf";
import { describeBrowser, describeDevice } from "./user-agent";
import type { ActivityEvent } from "./types";

/** Writes one activity row. Never throws: a failed log line must not break the page or action that wrote it. */
export async function logActivity(userId: string, event: ActivityEvent, detail: Record<string, unknown> = {}) {
  try {
    const ua = (await headers()).get("user-agent") ?? "";
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
  } catch (err) {
    console.error("activity_log insert failed", err instanceof Error ? err.message : "unknown error");
  }
}

/**
 * Same row, without making the response wait for it: student page views and autosaves only. The insert starts now,
 * on the server, and Vercel keeps the function alive until it finishes. Logins and admin actions keep awaiting
 * logActivity so their trail is written before the response.
 */
export function logActivityInBackground(userId: string, event: ActivityEvent, detail: Record<string, unknown> = {}) {
  waitUntil(logActivity(userId, event, detail));
}
