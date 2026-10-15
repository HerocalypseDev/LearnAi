"use client";

import { Suspense, use, useRef, useState, type ReactNode } from "react";
import { confirmUpload, removeUpload, requestUpload as serverRequestUpload, type UploadedFile } from "@/app/actions/student";
import { ProgressBar, Spinner } from "@/components/spinner";
import { checkUpload, MAX_FILES, THUMBNAIL_MAX_PX } from "@/lib/rules";
import { isWritingFileName } from "@/lib/task-text";
import type { PreviewLinks } from "@/lib/types";
import { TaskEditor } from "./text-editor";

export interface UploadView {
  id: string;
  file_name: string;
  file_type: string | null;
  size_bytes: number;
  /**
   * Signed links (1 hour) when the server sent them with the file (a fresh upload). Left out for the files the page
   * loaded with: theirs arrive in the `links` promise, which streams in after the page.
   */
  links?: PreviewLinks | null;
}

/** Signed links by upload id, still being signed on the server when the page first renders. */
export type UploadLinks = Promise<Record<string, PreviewLinks>>;

/** Hands a file's links to `children` once known; suspends on the page's link promise until then. */
function WithLinks({
  upload,
  links,
  children,
}: {
  upload: UploadView;
  links: UploadLinks;
  children: (links: PreviewLinks | null) => ReactNode;
}) {
  return children(upload.links !== undefined ? upload.links : (use(links)[upload.id] ?? null));
}

/**
 * A small JPEG of a picture (longest side THUMBNAIL_MAX_PX), so the file list doesn't download the full photo.
 * Null when the browser can't read the picture; the list then shows the original.
 */
async function makeThumbnail(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMBNAIL_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // transparent PNGs get a white background in the JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
  } catch {
    return null;
  }
}

interface InProgress {
  key: string;
  name: string;
  percent: number;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isImage = (u: UploadView) => /^image\//.test(u.file_type ?? "") || /\.(png|jpe?g|gif|webp)$/i.test(u.file_name);
const isPdf = (u: UploadView) => u.file_type === "application/pdf" || /\.pdf$/i.test(u.file_name);

/** PUT the file to Supabase's signed upload URL, reporting progress. */
function sendFile(url: string, file: Blob, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your internet."));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}

export function Uploads({
  homeworkId,
  studentId,
  uploads,
  links,
  locked,
  refreshing = false,
  onAdded,
  onReplaced,
  onRemoved,
  onLocked,
}: {
  homeworkId: string;
  studentId: string;
  uploads: UploadView[];
  links: UploadLinks;
  locked: boolean;
  /** The page is re-reading itself (after the result was released). */
  refreshing?: boolean;
  onAdded: (file: UploadedFile) => void;
  onReplaced: (file: UploadedFile) => void;
  onRemoved: (id: string) => void;
  /** An action said the result was released: the page re-reads itself to show the task as closed. */
  onLocked: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<InProgress[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editingUpload, setEditingUpload] = useState<{ id: string; text: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setErrors([]);
    let count = uploads.length;
    const problems: string[] = [];
    let lockedNow = false;

    for (const [i, file] of list.entries()) {
      const problem = checkUpload(file.name, file.size, count);
      if (problem) {
        problems.push(problem);
        continue;
      }
      count++;
      // Keyed per pick, so two files with the same name each get their own progress bar.
      const key = `${Date.now()}-${i}`;
      setProgress((p) => [...p, { key, name: file.name, percent: 0 }]);
      try {
        const start = await serverRequestUpload({ homeworkId, fileName: file.name, sizeBytes: file.size });
        if (!start.ok) {
          if (start.locked) lockedNow = true;
          throw new Error(start.error);
        }
        await sendFile(start.signedUrl, file, (percent) =>
          setProgress((p) => p.map((x) => (x.key === key ? { ...x, percent } : x))),
        );
        // Best effort: without a preview the list just shows the original picture.
        if (start.thumbUrl) {
          const thumb = await makeThumbnail(file);
          if (thumb) await sendFile(start.thumbUrl, thumb, () => {}).catch(() => {});
        }
        const done = await confirmUpload({ homeworkId, path: start.path, fileName: file.name, fileType: file.type });
        if (!done.ok) {
          if (done.locked) lockedNow = true;
          throw new Error(done.error);
        }
        onAdded(done.upload);
      } catch (e) {
        count--;
        problems.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      } finally {
        setProgress((p) => p.filter((x) => x.key !== key));
      }
    }

    setErrors(problems);
    if (inputRef.current) inputRef.current.value = "";
    if (lockedNow) onLocked();
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this file?")) return;
    setRemoving(id);
    const result = await removeUpload(id);
    setRemoving(null);
    setErrors(result.ok ? [] : [result.error]);
    if (result.ok) onRemoved(id);
    else if (result.locked) onLocked();
  }

  /** Open a written piece in the editor with its current text; saving replaces that same file. */
  async function handleEdit(upload: UploadView, link: string | null | undefined) {
    if (!link) return setErrors([`Couldn't open ${upload.file_name}. Reload the page and try again.`]);
    setOpening(upload.id);
    try {
      const response = await fetch(link, { cache: "no-store" });
      if (!response.ok) throw new Error(`it didn't load (${response.status}). Reload the page and try again.`);
      setErrors([]);
      setEditingUpload({ id: upload.id, text: await response.text() });
    } catch (err) {
      setErrors([`Couldn't open ${upload.file_name}: ${err instanceof Error ? err.message : "check your internet"}`]);
    } finally {
      setOpening(null);
    }
  }

  const busy = progress.length > 0 || refreshing;
  const full = uploads.length >= MAX_FILES;

  return (
    <div className="space-y-3">
      {editingUpload && !locked && (
        <TaskEditor
          homeworkId={homeworkId}
          studentId={studentId}
          uploadId={editingUpload.id}
          initialText={editingUpload.text}
          onClose={() => setEditingUpload(null)}
          onSuccess={onReplaced}
          onLocked={onLocked}
        />
      )}
      {uploads.length === 0 && !busy && <p className="text-sm text-slate-500">No files attached yet.</p>}

      {/* While the page re-reads the list, the old one stays on screen, dimmed, instead of going blank. */}
      <ul aria-busy={refreshing} className={`space-y-2 transition-opacity ${refreshing ? "opacity-60" : ""}`}>
        {uploads.map((u) => (
          <li key={u.id} className="flex animate-pop items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 transition hover:shadow-md">
            <Suspense fallback={<FileDetails upload={u} links={undefined} />}>
              <WithLinks upload={u} links={links}>
                {(fileLinks) => (
                  <FileDetails upload={u} links={fileLinks}>
                    {!locked && isWritingFileName(u.file_name) && (
                      <button
                        type="button"
                        onClick={() => void handleEdit(u, fileLinks?.link)}
                        disabled={opening !== null || busy}
                        className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
                      >
                        {opening === u.id ? (
                          <span className="inline-flex items-center gap-1">
                            <Spinner size="sm" /> Opening…
                          </span>
                        ) : (
                          "Edit"
                        )}
                      </button>
                    )}
                  </FileDetails>
                )}
              </WithLinks>
            </Suspense>
            {!locked && (
              <button
                onClick={() => handleRemove(u.id)}
                disabled={removing !== null || busy}
                aria-busy={removing === u.id}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-95 disabled:opacity-50"
              >
                {removing === u.id ? (
                  <>
                    <Spinner size="sm" /> Removing…
                  </>
                ) : (
                  "Remove"
                )}
              </button>
            )}
          </li>
        ))}
        {progress.map((p) => (
          <li key={p.key} className="animate-fade-up rounded-xl border border-indigo-200 bg-white p-3">
            <ProgressBar percent={p.percent} label={`Uploading ${p.name}…`} />
          </li>
        ))}
      </ul>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {!locked && (
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            id={`files-${homeworkId}`}
            onChange={(e) => void handleFiles(e.target.files)}
            disabled={busy || full}
          />
          <label
            htmlFor={`files-${homeworkId}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragging) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!full && !busy) void handleFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition duration-200 ${
              dragging
                ? "scale-[1.02] border-indigo-500 bg-indigo-50 shadow-lg"
                : "border-indigo-200 bg-indigo-50/40 hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-50 hover:shadow-md"
            } active:scale-[0.99] ${busy ? "pointer-events-none opacity-70" : full ? "pointer-events-none opacity-50" : ""}`}
            aria-busy={busy}
            aria-disabled={busy || full}
          >
            {busy ? (
              <>
                <Spinner size="lg" className="my-1 text-indigo-600" />
                <span aria-live="polite" className="font-semibold text-indigo-700">
                  {progress.length > 0 ? "Uploading…" : "Updating your files…"}
                </span>
                <span className="hidden text-xs text-slate-500 sm:block">You can attach more when this finishes</span>
              </>
            ) : (
              <>
                <span className={`text-3xl transition ${dragging ? "animate-wiggle" : ""}`}>{dragging ? "📥" : "📎"}</span>
                <span className="font-semibold text-indigo-700">{dragging ? "Drop it here!" : "Tap to attach files"}</span>
                <span className="hidden text-xs text-slate-500 sm:block">or drag them into this box</span>
              </>
            )}
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Documents, pictures, PDFs, Scratch projects… up to 20MB each, {MAX_FILES} files max. Program files (.exe, .apk…) aren&apos;t
            allowed.
          </p>
        </div>
      )}
    </div>
  );
}

/** Thumbnail, name, size and Preview / Download link of one file. `links` undefined: still being signed. */
function FileDetails({ upload: u, links, children }: { upload: UploadView; links: PreviewLinks | null | undefined; children?: ReactNode }) {
  const link = links?.link;
  return (
    <>
      {isImage(u) && link ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link, not worth image optimisation
        <img src={links.thumb ?? link} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold uppercase text-slate-500 ${
            links === undefined && isImage(u) ? "animate-pulse" : ""
          }`}
        >
          {u.file_name.split(".").pop()?.slice(0, 4)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{u.file_name}</div>
        <div className="text-xs text-slate-500">{formatSize(u.size_bytes)}</div>
        <div className="flex gap-2">
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
              {isImage(u) || isPdf(u) ? "Preview" : "Download"}
            </a>
          )}
          {children}
        </div>
      </div>
    </>
  );
}
