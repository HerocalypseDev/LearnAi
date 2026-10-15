"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";

/** Submit button that asks "are you sure?" first, then shows it's working until the action finishes. */
export function ConfirmButton({
  message,
  className,
  children,
  disabled,
  pendingLabel = "Working…",
}: {
  message: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {pending ? (
        <>
          <Spinner /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
