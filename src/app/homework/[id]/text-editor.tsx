"use client";

import { useRef, useState } from "react";
import { confirmUpload, uploadTaskText } from "@/app/actions/student";
import { Spinner } from "@/components/spinner";
import { loadLocalStorage, removeLocalStorage, saveLocalStorage } from "@/lib/local-storage-client";
import { cursorAfterInsert, insertListLine, isListLine, lineAt, MAX_TEXT_LENGTH, nextListPrefix, textProblem } from "@/lib/task-text";

export interface TaskEditorProps {
  homeworkId: string;
  /** Part of the draft key, so two children sharing a browser never see each other's draft. */
  studentId: string;
  onClose: () => void;
  onSuccess?: () => void;
  /** Editing an existing Writing-N.txt: saving replaces that file. */
  uploadId?: string;
  initialText?: string;
}

/** Where the unsent text is kept until it's uploaded: one key per new piece, one per edited file. */
export function draftKey(studentId: string, homeworkId: string, uploadId?: string): string {
  return `task-text-${studentId}-${homeworkId}${uploadId ? `-${uploadId}` : ""}`;
}

/** PUT the text to Supabase's signed upload URL (always a new object: edits never overwrite in place). */
function sendText(url: string, blob: Blob, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your internet."));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", blob);
    xhr.send(body);
  });
}

export function TaskEditor({ homeworkId, studentId, onClose, onSuccess, uploadId, initialText }: TaskEditorProps) {
  const key = draftKey(studentId, homeworkId, uploadId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // An unsent draft wins over the stored text: it is newer. This component only mounts in the browser (on a click).
  const [text, setTextState] = useState(() => loadLocalStorage(key) || initialText || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const tooLong = text.length > MAX_TEXT_LENGTH;

  function setText(value: string) {
    setTextState(value);
    // The draft is only kept while it differs from what's already uploaded.
    if (value === (initialText ?? "")) removeLocalStorage(key);
    else saveLocalStorage(key, value);
  }

  function close() {
    if (!saving) onClose();
  }

  async function handleUpload() {
    const problem = textProblem(text);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const start = await uploadTaskText({ homeworkId, text, uploadId });
      if (!start.ok) throw new Error(start.error);
      await sendText(start.signedUrl, new Blob([text], { type: "text/plain;charset=utf-8" }), (percent) => setProgress(`${percent}%`));
      const done = await confirmUpload({
        homeworkId,
        path: start.path,
        fileName: start.fileName,
        fileType: "text/plain",
        ...(start.uploadId ? { replaceUploadId: start.uploadId } : {}),
      });
      if (!done.ok) throw new Error(done.error);
      // Uploaded: the draft has done its job.
      removeLocalStorage(key);
      onSuccess?.();
      onClose();
    } catch (err) {
      // The draft stays in this browser, so nothing typed is lost.
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
      setSaving(false);
      setProgress("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    // Only take over Enter on list lines (continue or end the list); elsewhere the browser's own Enter is fine.
    if (el.selectionStart !== el.selectionEnd || !isListLine(lineAt(text, el.selectionStart))) return;
    e.preventDefault();
    const pos = el.selectionStart;
    const next = insertListLine(text, pos, "");
    setText(next);
    const cursor = cursorAfterInsert(text, next, pos);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(cursor, cursor);
      textareaRef.current?.focus();
    });
  }

  function addListLine(prefix: "- " | "1. ") {
    const lastLine = text.split("\n").pop() ?? "";
    // Continue the list the last line is already in; otherwise start a new one with this kind of item.
    const continued = nextListPrefix(lastLine);
    const next = continued ? `${text}\n${continued}` : lastLine.trim() ? `${text}\n${prefix}` : `${text}${prefix}`;
    setText(next);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(next.length, next.length);
      textareaRef.current?.focus();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={uploadId ? "Edit your writing" : "Write your task"}
        className="flex max-h-[95vh] w-full max-w-5xl flex-col gap-4 overflow-hidden rounded-2xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-bold">{uploadId ? "Edit your writing" : "Write your task"}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
            autoFocus
            rows={16}
            placeholder="Type your task here…"
            className="h-full w-full resize-none rounded-xl border border-slate-200 p-3 leading-relaxed focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex shrink-0 items-center justify-between text-sm">
          <span className="flex gap-3">
            <button type="button" onClick={() => addListLine("- ")} disabled={saving} className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
              Add bullet
            </button>
            <button type="button" onClick={() => addListLine("1. ")} disabled={saving} className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
              Add numbered line
            </button>
          </span>
          <span className={`text-xs ${tooLong ? "font-semibold text-red-600" : "text-slate-500"}`}>
            {text.length.toLocaleString("en-GB")} / {MAX_TEXT_LENGTH.toLocaleString("en-GB")}
          </span>
        </div>

        {error && <p className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {progress && <div className="shrink-0 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">Uploading: {progress}</div>}

        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Your writing is kept on this device until you upload it.</p>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={saving || !text.trim() || tooLong}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner /> : uploadId ? "Save changes" : "Upload task"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
