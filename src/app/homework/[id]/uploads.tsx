"use client";

import { useRef, useState } from "react";
import { confirmUpload, removeUpload, requestUpload as serverRequestUpload } from "@/app/actions/student";
import { ProgressBar, Spinner } from "@/components/spinner";
import { checkUpload, MAX_FILES } from "@/lib/rules";
import { isWritingFileName } from "@/lib/task-text";
import { TaskEditor } from "./text-editor";

export interface UploadView {
  id: string;
  file_name: string;
  file_type: string | null;
  size_bytes: number;
  link: string | null;
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
function sendFile(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
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
  locked,
  refreshing = false,
  onUploadChange,
}: {
  homeworkId: string;
  studentId: string;
  uploads: UploadView[];
  locked: boolean;
  /** The page is re-reading the list after a change. */
  refreshing?: boolean;
  onUploadChange?: () => void;
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
        if (!start.ok) throw new Error(start.error);
        await sendFile(start.signedUrl, file, (percent) =>
          setProgress((p) => p.map((x) => (x.key === key ? { ...x, percent } : x))),
        );
        const done = await confirmUpload({ homeworkId, path: start.path, fileName: file.name, fileType: file.type });
        if (!done.ok) throw new Error(done.error);
      } catch (e) {
        count--;
        problems.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      } finally {
        setProgress((p) => p.filter((x) => x.key !== key));
      }
    }

    setErrors(problems);
    if (inputRef.current) inputRef.current.value = "";
    onUploadChange?.();
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this file?")) return;
    setRemoving(id);
    const result = await removeUpload(id);
    setRemoving(null);
    setErrors(result.ok ? [] : [result.error]);
    onUploadChange?.();
  }

  /** Open a written piece in the editor with its current text; saving replaces that same file. */
  async function handleEdit(upload: UploadView) {
    if (!upload.link) return setErrors([`Couldn't open ${upload.file_name}. Reload the page and try again.`]);
    setOpening(upload.id);
    try {
      const response = await fetch(upload.link, { cache: "no-store" });
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
          onSuccess={() => onUploadChange?.()}
        />
      )}
      {uploads.length === 0 && !busy && <p className="text-sm text-slate-500">No files attached yet.</p>}

      {/* While the page re-reads the list, the old one stays on screen, dimmed, instead of going blank. */}
      <ul aria-busy={refreshing} className={`space-y-2 transition-opacity ${refreshing ? "opacity-60" : ""}`}>
        {uploads.map((u) => (
          <li key={u.id} className="flex animate-pop items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 transition hover:shadow-md">
            {isImage(u) && u.link ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link, not worth image optimisation
              <img src={u.link} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold uppercase text-slate-500">
                {u.file_name.split(".").pop()?.slice(0, 4)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.file_name}</div>
              <div className="text-xs text-slate-500">{formatSize(u.size_bytes)}</div>
              <div className="flex gap-2">
                {u.link && (
                  <a href={u.link} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                    {isImage(u) || isPdf(u) ? "Preview" : "Download"}
                  </a>
                )}
                {!locked && isWritingFileName(u.file_name) && (
                  <button
                    type="button"
                    onClick={() => void handleEdit(u)}
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
              </div>
            </div>
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
