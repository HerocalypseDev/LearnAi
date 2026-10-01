"use client";

import { useEffect, useRef, useState } from "react";
import { saveAnswer } from "@/app/actions/student";
import { Spinner } from "@/components/spinner";
import { inputClass } from "@/components/ui";
import type { StudentQuestion } from "@/lib/types";

export interface SavedAnswer {
  answer_text: string | null;
  selected_option: number | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const TEXT_SAVE_DELAY_MS = 800;

/** Time spent on a question since it was last reported, including the current focus. */
function takeActiveMs(focusStart: Record<string, number>, unsent: Record<string, number>, questionId: string) {
  const now = Date.now();
  let ms = unsent[questionId] ?? 0;
  if (focusStart[questionId]) {
    ms += now - focusStart[questionId];
    focusStart[questionId] = now;
  }
  unsent[questionId] = 0;
  return ms;
}

export function Quiz({
  homeworkId,
  questions,
  initial,
  locked,
  earned,
}: {
  homeworkId: string;
  questions: StudentQuestion[];
  initial: Record<string, SavedAnswer>;
  locked: boolean;
  /** Points per question, only passed once results are visible. */
  earned?: Record<string, number | null>;
}) {
  const [answers, setAnswers] = useState(initial);
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Time spent on each question: start time while focused, and time not yet reported.
  const focusStart = useRef<Record<string, number>>({});
  const unsentMs = useRef<Record<string, number>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  async function save(questionId: string, value: SavedAnswer) {
    setStatus((s) => ({ ...s, [questionId]: "saving" }));
    const result = await saveAnswer({
      homeworkId,
      questionId,
      answerText: value.answer_text ?? undefined,
      selectedOption: value.selected_option,
      activeMs: takeActiveMs(focusStart.current, unsentMs.current, questionId),
    });
    setStatus((s) => ({ ...s, [questionId]: result.ok ? "saved" : "error" }));
    setError(result.ok ? null : result.error);
  }

  function update(questionId: string, value: SavedAnswer, delay: number) {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    clearTimeout(timers.current[questionId]);
    if (delay === 0) void save(questionId, value);
    else timers.current[questionId] = setTimeout(() => void save(questionId, value), delay);
  }

  function flush(questionId: string) {
    if (timers.current[questionId]) {
      clearTimeout(timers.current[questionId]);
      delete timers.current[questionId];
      const value = answers[questionId];
      if (value) void save(questionId, value);
    }
  }

  return (
    <div className="space-y-4">
      {questions.map((q, i) => {
        const value = answers[q.id] ?? { answer_text: null, selected_option: null };
        const points = earned?.[q.id];
        return (
          <fieldset
            key={q.id}
            className="rounded-2xl border border-slate-200 bg-white/60 p-4 transition focus-within:border-indigo-300 focus-within:shadow-md"
            onFocus={() => {
              focusStart.current[q.id] = Date.now();
            }}
            onBlur={() => {
              const start = focusStart.current[q.id];
              if (start) unsentMs.current[q.id] = (unsentMs.current[q.id] ?? 0) + Date.now() - start;
              delete focusStart.current[q.id];
              flush(q.id);
            }}
          >
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="font-medium">
                <span className="mr-1 text-indigo-600">{i + 1}.</span>
                <span className="whitespace-pre-wrap">{q.prompt}</span>
              </p>
              <span className="shrink-0 text-xs text-slate-500">
                {earned ? (
                  <span className="font-semibold text-emerald-700">
                    {points ?? "–"} / {q.points}
                  </span>
                ) : (
                  `${q.points} pts`
                )}
              </span>
            </div>

            {q.type === "mcq" ? (
              <div className="space-y-2">
                {q.options.map((option, oi) => {
                  const picked = value.selected_option === oi;
                  return (
                    <label
                      key={oi}
                      className={`group flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 transition duration-150 ${
                        picked ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/10" : "border-slate-200 bg-white"
                      } ${
                        locked
                          ? "cursor-default opacity-80"
                          : "cursor-pointer hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md active:scale-[0.98]"
                      } has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-indigo-200`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={picked}
                        disabled={locked}
                        onChange={() => update(q.id, { answer_text: null, selected_option: oi }, 0)}
                        className="sr-only"
                      />
                      <span
                        key={picked ? "on" : "off"}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
                          picked
                            ? "animate-pop bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md"
                            : "bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700"
                        }`}
                      >
                        {picked ? "✓" : String.fromCharCode(65 + oi)}
                      </span>
                      <span className={picked ? "font-semibold text-indigo-900" : ""}>{option}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={value.answer_text ?? ""}
                disabled={locked}
                rows={3}
                maxLength={5000}
                placeholder="Type your answer…"
                onChange={(e) => update(q.id, { answer_text: e.target.value, selected_option: null }, TEXT_SAVE_DELAY_MS)}
                className={inputClass}
              />
            )}

            {!locked && <SaveNote state={status[q.id]} />}
          </fieldset>
        );
      })}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function SaveNote({ state }: { state?: SaveState }) {
  if (!state || state === "idle") return null;
  if (state === "saving") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Spinner className="h-3 w-3" /> Saving…
      </p>
    );
  }
  return (
    <p
      key={state}
      className={`mt-2 inline-flex animate-pop items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        state === "saved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {state === "saved" ? "Saved ✓" : "Not saved — try again"}
    </p>
  );
}
