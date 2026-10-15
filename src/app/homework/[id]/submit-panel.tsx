"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitHomework } from "@/app/actions/student";
import { Spinner } from "@/components/spinner";
import { bigGoButtonClass } from "@/components/ui";
import { daysLate, latePenalty, PARTS } from "@/lib/rules";
import { ANSWER_EVENT, type AnswerEventDetail } from "./quiz";

export function SubmitPanel({
  homeworkId,
  dueAt,
  unansweredIds,
  fileCount,
  penalty,
}: {
  homeworkId: string;
  dueAt: string;
  /** Questions without an answer when the page loaded; kept current as the child answers. */
  unansweredIds: string[];
  /** Task files right now (the page re-renders after each upload or removal). */
  fileCount: number;
  penalty: { perDay: number; cap: number };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unanswered, setUnanswered] = useState(() => new Set(unansweredIds));

  useEffect(() => {
    const onAnswer = (e: Event) => {
      const { questionId, answered } = (e as CustomEvent<AnswerEventDetail>).detail;
      setUnanswered((prev) => {
        if (answered === !prev.has(questionId)) return prev;
        const next = new Set(prev);
        if (answered) next.delete(questionId);
        else next.add(questionId);
        return next;
      });
    };
    window.addEventListener(ANSWER_EVENT, onAnswer);
    return () => window.removeEventListener(ANSWER_EVENT, onAnswer);
  }, []);

  async function handleSubmit() {
    if (pending) return;
    const missing = unanswered.size;
    const late = daysLate(new Date(dueAt), new Date());
    const lines = ["Hand in your quiz and short answer? You can't change those afterwards, but you can still add or change your task files."];
    if (missing > 0) lines.push(`\nYou haven't answered ${missing} question${missing === 1 ? "" : "s"}.`);
    if (fileCount === 0) lines.push(`\nYour task isn't uploaded yet. It's worth ${PARTS.task} points, so add it before your teacher marks it!`);
    if (late > 0) lines.push(`\nIt's ${late} day${late === 1 ? "" : "s"} late: you'll lose ${latePenalty(late, penalty.perDay, penalty.cap)} points.`);
    if (!confirm(lines.join(""))) return;

    setPending(true);
    const result = await submitHomework(homeworkId);
    if (result.ok) {
      router.push("/dashboard?done=handed-in");
      return;
    }
    setPending(false);
    setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button onClick={handleSubmit} disabled={pending} aria-busy={pending} className={bigGoButtonClass}>
        {pending ? (
          <>
            <Spinner /> Handing in…
          </>
        ) : (
          <>Hand in quiz &amp; short answer 🎯</>
        )}
      </button>
      <p className="text-center text-xs text-slate-500">Your answers save as you go. Hand in once your quiz and short answer are finished. Your task files can come later.</p>
      <p aria-live="polite" className="sr-only">
        {pending ? "Handing in your quiz and short answer…" : ""}
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
