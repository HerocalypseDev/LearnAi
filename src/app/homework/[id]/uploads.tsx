"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmUpload, removeUpload, requestUpload } from "@/app/actions/student";
import { checkUpload, MAX_FILES } from "@/lib/rules";

export interface UploadView {
  id: string;
  file_name: string;
  file_type: string | null;
  size_bytes: number;
  link: string | null;
}

interface InProgress {
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

export function Uploads({ homeworkId, uploads, locked }: { homeworkId: string; uploads: UploadView[]; locked: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<InProgress[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setErrors([]);
    let count = uploads.length;
    const problems: string[] = [];

    for (const file of list) {
      const problem = checkUpload(file.name, file.size, count);
      if (problem) {
        problems.push(problem);
        continue;
      }
      count++;
      setProgress((p) => [...p, { name: file.name, percent: 0 }]);
      try {
        const start = await requestUpload({ homeworkId, fileName: file.name, sizeBytes: file.size });
        if (!start.ok) throw new Error(start.error);
        await sendFile(start.signedUrl, file, (percent) =>
          setProgress((p) => p.map((x) => (x.name === file.name ? { ...x, percent } : x))),
        );
        const done = await confirmUpload({ homeworkId, path: start.path, fileName: file.name, fileType: file.type });
        if (!done.ok) throw new Error(done.error);
      } catch (e) {
        count--;
        problems.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      } finally {
        setProgress((p) => p.filter((x) => x.name !== file.name));
      }
    }

    setErrors(problems);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this file?")) return;
    setRemoving(id);
    const result = await removeUpload(id);
    setRemoving(null);
    if (!result.ok) setErrors([result.error]);
    router.refresh();
  }

  const busy = progress.length > 0;
  const full = uploads.length >= MAX_FILES;

  return (
    <div className="space-y-3">
      {uploads.length === 0 && !busy && <p className="text-sm text-slate-500">No files attached yet.</p>}

      <ul className="space-y-2">
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
              {u.link && (
                <a href={u.link} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                  {isImage(u) || isPdf(u) ? "Preview" : "Download"}
                </a>
              )}
            </div>
            {!locked && (
              <button
                onClick={() => handleRemove(u.id)}
                disabled={removing === u.id || busy}
                className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-95 disabled:opacity-50"
              >
                {removing === u.id ? "Removing…" : "Remove"}
              </button>
            )}
          </li>
        ))}
        {progress.map((p) => (
          <li key={p.name} className="animate-fade-up rounded-xl border border-indigo-200 bg-white p-3">
            <div className="mb-1 truncate text-sm">Uploading {p.name}…</div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${p.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
            } active:scale-[0.99] ${full || busy ? "pointer-events-none opacity-50" : ""}`}
          >
            <span className={`text-3xl transition ${dragging ? "animate-wiggle" : ""}`}>{dragging ? "📥" : "📎"}</span>
            <span className="font-semibold text-indigo-700">{dragging ? "Drop it here!" : "Tap to attach files"}</span>
            <span className="hidden text-xs text-slate-500 sm:block">or drag them into this box</span>
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
