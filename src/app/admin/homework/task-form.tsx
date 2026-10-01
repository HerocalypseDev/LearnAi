"use client";

import { useActionState } from "react";
import { saveTaskInstructions, type FormState } from "@/app/actions/homework-admin";
import { buttonClass, inputClass } from "@/components/ui";
import type { VersionNames } from "./homework-form";

export function TaskForm({ id, a, b, names }: { id: string; a: string; b: string; names: VersionNames }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTaskInstructions, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Task instructions — Version A ({names.A})</span>
        <textarea name="instructions_a" defaultValue={a} rows={7} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Task instructions — Version B ({names.B})</span>
        <textarea name="instructions_b" defaultValue={b} rows={7} className={`mt-1 ${inputClass}`} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save task"}
        </button>
        {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
