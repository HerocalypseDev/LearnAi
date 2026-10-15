"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MAX_FILES } from "@/lib/rules";
import { TaskEditor } from "./text-editor";
import { Uploads, type UploadView } from "./uploads";

/**
 * The task's files plus the "Write text" editor. The list comes from the server page as props; after any change
 * (upload, remove, new or edited writing) router.refresh() re-renders the page on the server, so the list, the
 * file count in the hand-in panel and the lock all come from the database rather than from copied client state.
 */
export function TaskSection({
  homeworkId,
  studentId,
  uploads,
  locked,
}: {
  homeworkId: string;
  studentId: string;
  uploads: UploadView[];
  locked: boolean;
}) {
  const router = useRouter();
  const [writing, setWriting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const refresh = () => startRefresh(() => router.refresh());
  const full = uploads.length >= MAX_FILES;

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
      <Uploads homeworkId={homeworkId} studentId={studentId} uploads={uploads} locked={locked} refreshing={refreshing} onUploadChange={refresh} />
      {writing && !locked && (
        <TaskEditor homeworkId={homeworkId} studentId={studentId} onClose={() => setWriting(false)} onSuccess={refresh} />
      )}
    </>
  );
}
