"use client";

import { useActionState } from "react";
import { saveHomework, type FormState } from "@/app/actions/homework-admin";
import { buttonClass, inputClass } from "@/components/ui";

export type VersionNames = { A: string; B: string };

export interface HomeworkFormValues {
  id?: string;
  week: number;
  title: string;
  due_date: string;
  due_time: string;
}

export function HomeworkForm({ values }: { values: HomeworkFormValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHomework, {});

  return (
    <form action={action} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Title</span>
          <input name="title" defaultValue={values.title} required className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Week</span>
          <select name="week" defaultValue={values.week} className={`mt-1 ${inputClass}`}>
            {[1, 2, 3, 4].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Due date</span>
          <input type="date" name="due_date" defaultValue={values.due_date} required className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Due time (Lagos)</span>
          <input type="time" name="due_time" defaultValue={values.due_time} required className={`mt-1 ${inputClass}`} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Create homework"}
        </button>
        {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
