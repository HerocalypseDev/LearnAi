"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";
import { smallSecondaryButtonClass } from "./ui";

/** The top bar's Log out button; shows it's working until the login page arrives. */
export function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-busy={pending} className={smallSecondaryButtonClass}>
      {pending ? (
        <>
          <Spinner size="sm" /> Logging out…
        </>
      ) : (
        "Log out"
      )}
    </button>
  );
}
