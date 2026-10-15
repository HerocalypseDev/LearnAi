"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { UploadedFile } from "@/app/actions/student";
import { MAX_FILES } from "@/lib/rules";
import { TaskEditor } from "./text-editor";
import { Uploads, type UploadLinks, type UploadView } from "./uploads";

/** Fired on window whenever the number of task files changes, so the hand-in panel's file count stays current. */
export const FILES_EVENT = "homework-files";
export type FilesEventDetail = { count: number };

/**
 * The task's files plus the "Write text" editor. The list starts from the server page's props; after an upload,
 * removal or new / edited writing, the server action answers with that file and the list is updated here, without
 * re-reading the page. Only when an action says the result was released does the page refresh, to show the lock.
 */
export function TaskSection({
  homeworkId,
  studentId,
  uploads,
  links,
  locked,
}: {
  homeworkId: string;
  studentId: string;
  uploads: UploadView[];
  links: UploadLinks;
  locked: boolean;
}) {
  const router = useRouter();
  const [writing, setWriting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [files, setFiles] = useState(uploads);
  // A refresh from the server (the lock, a later visit) brings a new list: it replaces the local one.
  const [fromServer, setFromServer] = useState(uploads);
  if (uploads !== fromServer) {
    setFromServer(uploads);
    setFiles(uploads);
  }

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<FilesEventDetail>(FILES_EVENT, { detail: { count: files.length } }));
  }, [files.length]);

  const onAdded = (file: UploadedFile) => setFiles((list) => [...list.filter((u) => u.id !== file.id), file]);
  const onReplaced = (file: UploadedFile) => setFiles((list) => list.map((u) => (u.id === file.id ? file : u)));
  const onRemoved = (id: string) => setFiles((list) => list.filter((u) => u.id !== id));
  const onLocked = () => startRefresh(() => router.refresh());
  const full = files.length >= MAX_FILES;

  return (
    <>
      {!locked && (
        <button
          type="button"
          onClick={() => setWriting(true)}
          disabled={full}
          title={full ? `You already have ${MAX_FILES} files. Remove one to add writing.` : undefined}
          className="mb-3 w-full rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/40 px-4 py-3 text-center text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✍️ Write text instead of uploading a file
        </button>
      )}
      <Uploads
        homeworkId={homeworkId}
        studentId={studentId}
        uploads={files}
        links={links}
        locked={locked}
        refreshing={refreshing}
        onAdded={onAdded}
        onReplaced={onReplaced}
        onRemoved={onRemoved}
        onLocked={onLocked}
      />
      {writing && !locked && (
        <TaskEditor homeworkId={homeworkId} studentId={studentId} onClose={() => setWriting(false)} onSuccess={onAdded} onLocked={onLocked} />
      )}
    </>
  );
}

/** The note under a handed-in quiz, kept in step with the task files added or removed since the page loaded. */
export function HandedInNote({ fileCount, taskLocked }: { fileCount: number; taskLocked: boolean }) {
  const [count, setCount] = useState(fileCount);
  useEffect(() => {
    const onFiles = (e: Event) => setCount((e as CustomEvent<FilesEventDetail>).detail.count);
    window.addEventListener(FILES_EVENT, onFiles);
    return () => window.removeEventListener(FILES_EVENT, onFiles);
  }, []);
  return taskLocked
    ? "Your teacher will share your result after the deadline."
    : count === 0
      ? "Your task isn't uploaded yet. Add your files above when it's ready."
      : "Your teacher will mark it after the deadline. You can still change your task files above.";
}
