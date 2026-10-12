"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveLocalStorage, loadLocalStorage } from "@/lib/local-storage-client";
import { confirmUpload, requestUpload } from "@/app/actions/student";
import { Spinner } from "@/components/spinner";
import { appendListLine, insertListLine } from "@/lib/task-text";

function isListItem(text: string): boolean {
  const lines = text.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  const trimmed = lastLine.trim();
  return /^[-*] /.test(trimmed) || /^\d+\./.test(trimmed);
}

export interface TaskEditorProps {
  homeworkId: string;
  onClose: () => void;
}

export function TaskEditor({ homeworkId, onClose }: TaskEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characterCount, setCharacterCount] = useState(0);
  const [progress, setProgress] = useState<string>("");
  const LOCAL_STORAGE_KEY = `task-text-${homeworkId}`;

  async function sendFile(url: string, blob: Blob, onProgress: (percent: number) => void): Promise<void> {
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

  async function handleUpload() {
    if (!text.trim()) return setError("Write something before uploading.");
    setSaving(true);
    setError(null);

    try {
      const textBlob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const fileName = `Writing-${Date.now()}.txt`;
      const start = await requestUpload({ homeworkId, fileName, sizeBytes: textBlob.size });
      if (!start.ok) {
        setError(start.error);
        setSaving(false);
        return;
      }

      await sendFile(start.signedUrl, textBlob, (percent) => setProgress(`${percent}%`));
      const done = await confirmUpload({
        homeworkId,
        path: start.path,
        fileName,
        fileType: "text/plain",
      });
      if (!done.ok) {
        setError(done.error);
        setSaving(false);
        return;
      }

      setProgress("");
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setText("");
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setSaving(false);
      setProgress("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const pos = e.currentTarget.selectionStart;
      const newText = insertListLine(text, pos, "");
      setText(newText);
      setTimeout(() => {
        const newPos = pos + (newText.length - text.length);
        textareaRef.current?.setSelectionRange(newPos, newPos);
        textareaRef.current?.focus();
      }, 0);
    }
  }

  useEffect(() => {
    setCharacterCount(text.length);
    saveLocalStorage(LOCAL_STORAGE_KEY, text);
  }, [text, LOCAL_STORAGE_KEY]);

  useEffect(() => {
    const saved = loadLocalStorage(LOCAL_STORAGE_KEY);
    if (saved) setText(saved);
  }, [LOCAL_STORAGE_KEY]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-2xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Write your task</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div className="relative min-h-[300px] flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
            placeholder="Type your task here…"
            rows={15}
            className="w-full resize-none rounded-xl border border-slate-200 p-3 leading-relaxed focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed"
          />
        </div>

        <div className="mb-2 flex items-center justify-between text-sm">
          <button
            onClick={() => {
              setText(text ? appendListLine(text, "") : "- ");
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
            disabled={saving}
            className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
          >
            Add bullet
          </button>
          <span className={`text-xs ${characterCount > 20_000 ? "text-red-600" : "text-slate-500"}`}>
            {characterCount} / 20,000
          </span>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {progress && (
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
            Uploading: {progress}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={saving || !text.trim() || characterCount > 20_000}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Spinner /> : "Upload task"}
          </button>
        </div>
      </div>
    </div>
  );
}