"use client";

import { useActionState } from "react";
import { saveSettings, type PasswordState } from "@/app/actions/admin";
import { buttonClass, inputClass } from "@/components/ui";

export function SettingsForm({ perDay, cap }: { perDay: number; cap: number }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(saveSettings, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Points lost per late day
          <input name="late_penalty_per_day" type="number" min={0} max={100} defaultValue={perDay} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Most points lost (cap)
          <input name="late_penalty_cap" type="number" min={0} max={100} defaultValue={cap} className={`mt-1 ${inputClass}`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
