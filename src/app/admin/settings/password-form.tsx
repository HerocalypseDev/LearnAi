"use client";

import { Spinner } from "@/components/spinner";
import { useActionState } from "react";
import { buttonClass, inputClass } from "@/components/ui";
import { setPassword, type PasswordState } from "@/app/actions/admin";

export function PasswordForm({ userId, label, minLength = 6 }: { userId: string; label: string; minLength?: number }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <label className="block text-sm font-medium text-slate-700" htmlFor={`pw-${userId}`}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={`pw-${userId}`}
          name="password"
          type="text"
          autoComplete="off"
          minLength={minLength}
          required
          placeholder="New password"
          className={`min-w-0 flex-1 ${inputClass}`}
        />
        <button
          disabled={pending}
          className={buttonClass}
        >
          {pending ? (<><Spinner /> Saving…</>) : "Save"}
        </button>
      </div>
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
