"use client";

import { useActionState, useState } from "react";
import { deleteQuestion, saveQuestion, type FormState } from "@/app/actions/homework-admin";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import type { QuizQuestion } from "@/lib/types";
import type { VersionNames } from "./homework-form";

type Draft = Pick<QuizQuestion, "type" | "version" | "prompt" | "options" | "correct_option" | "points" | "position"> & {
  id?: string;
};

export function QuestionForm({
  homeworkId,
  question,
  names,
}: {
  homeworkId: string;
  question: Draft;
  names: VersionNames;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveQuestion, {});
  const [type, setType] = useState(question.type);
  const [points, setPoints] = useState(String(question.points));
  const [options, setOptions] = useState<string[]>(question.options.length ? question.options : ["", "", "", ""]);
  const [correct, setCorrect] = useState<number>(question.correct_option ?? 0);
  const [prompt, setPrompt] = useState(question.prompt);
  const radioGroup = `correct-${question.id ?? "new"}`;

  return (
    <form action={action} className="space-y-3">
      {question.id && <input type="hidden" name="id" value={question.id} />}
      <input type="hidden" name="homework_id" value={homeworkId} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2 block sm:col-span-1">
          <span className="text-xs font-medium text-slate-600">Type</span>
          <select
            name="type"
            value={type}
            onChange={(e) => {
              const next = e.target.value as Draft["type"];
              setType(next);
              // New questions: suggest the usual value for the explanation question.
              if (!question.id) setPoints(next === "short" ? "10" : String(question.points));
            }}
            className={`mt-1 ${inputClass}`}
          >
            <option value="mcq">Multiple choice</option>
            <option value="short">Short explanation</option>
          </select>
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <span className="text-xs font-medium text-slate-600">Who gets it</span>
          <select name="version" defaultValue={question.version} className={`mt-1 ${inputClass}`}>
            <option value="both">Both</option>
            <option value="A">A only ({names.A})</option>
            <option value="B">B only ({names.B})</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Points</span>
          <input
            name="points"
            type="number"
            min={0}
            max={40}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            required
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Order</span>
          <input name="position" type="number" defaultValue={question.position} className={`mt-1 ${inputClass}`} />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">Question</span>
        <textarea
          name="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          required
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {type === "mcq" && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-600">Options — tick the correct one</legend>
          {options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct_option"
                value={i}
                checked={correct === i}
                onChange={() => setCorrect(i)}
                aria-label={`Option ${i + 1} is correct`}
                className="h-5 w-5 accent-emerald-600"
                id={`${radioGroup}-${i}`}
              />
              <input
                name="options"
                value={option}
                onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                placeholder={`Option ${i + 1}`}
                className={inputClass}
              />
            </div>
          ))}
          {options.length < 6 && (
            <button type="button" onClick={() => setOptions([...options, ""])} className="text-sm text-indigo-600">
              + Add option
            </button>
          )}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : question.id ? "Save question" : "Add question"}
        </button>
        {question.id && (
          <button
            type="submit"
            formAction={deleteQuestion}
            formNoValidate
            onClick={(e) => {
              if (!confirm("Delete this question? Any answers to it are deleted too.")) e.preventDefault();
            }}
            className={`${secondaryButtonClass} text-red-700`}
          >
            Delete
          </button>
        )}
        {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
