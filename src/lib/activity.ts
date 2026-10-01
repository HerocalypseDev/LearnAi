import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { describeBrowser, describeDevice } from "./user-agent";
import type { ActivityEvent } from "./types";

export async function logActivity(userId: string, event: ActivityEvent, detail: Record<string, unknown> = {}) {
  const ua = (await headers()).get("user-agent") ?? "";
  const { error } = await db().from("activity_log").insert({
    user_id: userId,
    event,
    detail,
    device: describeDevice(ua),
    browser: describeBrowser(ua),
  });
  if (error) console.error("activity_log insert failed", error.message);
}
