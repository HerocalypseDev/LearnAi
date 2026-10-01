"use client";

import { useActionState } from "react";
import { setPassword, type PasswordState } from "@/app/actions/admin";

export function PasswordForm({ userId, label }: { userId: string; label: string }) {
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
          minLength={6}
          required
          placeholder="New password"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <button
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
