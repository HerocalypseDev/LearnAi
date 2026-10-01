import "server-only";
import { db } from "./db";

export const UPLOAD_BUCKET = "uploads";

export function bucket() {
  return db().storage.from(UPLOAD_BUCKET);
}

/** Folder that holds one student's files for one homework. */
export function uploadFolder(studentId: string, homeworkId: string): string {
  return `${studentId}/${homeworkId}`;
}

/** Storage-safe version of a file name (keeps the extension). */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "");
  return (cleaned || "file").slice(-80);
}

/** Signed links (valid 1 hour) for previewing / downloading private files. */
export async function signedLinks(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await bucket().createSignedUrls(paths, 60 * 60);
  if (error) {
    console.error("createSignedUrls failed", error.message);
    return {};
  }
  const links: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) links[item.path] = item.signedUrl;
  return links;
}
