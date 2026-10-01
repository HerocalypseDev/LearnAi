"use client";

import type { ReactNode } from "react";

/** Submit button that asks "are you sure?" first. */
export function ConfirmButton({
  message,
  className,
  children,
  disabled,
}: {
  message: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
