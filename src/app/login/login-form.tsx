"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { Spinner } from "@/components/spinner";
import { bigPrimaryButtonClass, inputClass } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="animate-fade-up space-y-4 rounded-3xl bg-white/90 p-6 shadow-xl shadow-indigo-500/10 ring-1 ring-slate-200 backdrop-blur">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Username</span>
        <input
          name="username"
          defaultValue={state.username}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="Your name"
          className={`mt-1 ${inputClass} py-2.5`}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <span className="relative mt-1 block">
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${inputClass} py-2.5 pr-16`}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute inset-y-1 right-1 rounded-lg px-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 active:scale-95"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        </span>
      </label>
      {state.error && (
        <p role="alert" className="animate-wiggle rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={bigPrimaryButtonClass}>
        {pending ? (
          <>
            <Spinner /> Logging in…
          </>
        ) : (
          "Let's go! 🚀"
        )}
      </button>
    </form>
  );
}
