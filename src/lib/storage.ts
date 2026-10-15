import "server-only";
import { db } from "./db";
import { timed } from "./perf";
import { canThumbnail } from "./rules";
import type { PreviewLinks } from "./types";

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
  const { data, error } = await timed("storage:signed_urls", () => bucket().createSignedUrls(paths, 60 * 60));
  if (error) {
    console.error("createSignedUrls failed", error.message);
    return {};
  }
  const links: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) links[item.path] = item.signedUrl;
  return links;
}

/** Where a picture's small preview is kept, beside it in a thumbs/ folder. It may be missing (older or small files). */
export function thumbnailPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return `${path.slice(0, slash)}/thumbs/${path.slice(slash + 1)}.jpg`;
}

/**
 * Signed links (1 hour) for files and, for pictures, their small previews, in one Storage call. Keyed by storage
 * path; a file whose link couldn't be made is left out.
 */
export async function signedPreviewLinks(files: { storage_path: string; file_name: string }[]): Promise<Record<string, PreviewLinks>> {
  const thumbs = files.filter((f) => canThumbnail(f.file_name)).map((f) => thumbnailPath(f.storage_path));
  const links = await signedLinks([...files.map((f) => f.storage_path), ...thumbs]);
  const out: Record<string, PreviewLinks> = {};
  for (const f of files) {
    const link = links[f.storage_path];
    if (link) out[f.storage_path] = { link, thumb: canThumbnail(f.file_name) ? (links[thumbnailPath(f.storage_path)] ?? null) : null };
  }
  return out;
}

/** Deletes files and their picture previews (a preview that doesn't exist is simply skipped). */
export function removeFiles(paths: string[]) {
  return bucket().remove([...paths, ...paths.map(thumbnailPath)]);
}
