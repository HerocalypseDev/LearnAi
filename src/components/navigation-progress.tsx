"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { Spinner } from "./spinner";

// Click feedback for <Link>s. Next's useLinkStatus says when a clicked link is still waiting for its page; every
// link indicator below reports that here, and while any is pending a thin bar runs along the top of the screen.
// Routes with a loading.tsx usually swap to their skeleton straight away, so the bar mostly shows on slow networks.

const ReportPending = createContext<(delta: 1 | -1) => void>(() => {});

/** Wraps the app (root layout) and draws the top bar while a link is pending. */
export function NavigationProgress({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);
  const report = useCallback((delta: 1 | -1) => setPending((n) => Math.max(0, n + delta)), []);

  return (
    <ReportPending.Provider value={report}>
      {children}
      {pending > 0 && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-indigo-100/70">
          <div className="h-full w-1/3 animate-progress rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 motion-reduce:w-full" />
        </div>
      )}
    </ReportPending.Provider>
  );
}

/** Whether the surrounding <Link> was clicked and its page hasn't arrived yet. Must be rendered inside a <Link>. */
export function useLinkPending(): boolean {
  const { pending } = useLinkStatus();
  const report = useContext(ReportPending);
  useEffect(() => {
    if (!pending) return;
    report(1);
    return () => report(-1);
  }, [pending, report]);
  return pending;
}

/**
 * Small spinner that appears next to a link's text while it's pending, and marks the link (data-link-pending) so its
 * classes can dim it and stop a second click. Takes no room when idle.
 */
export function LinkPending({ className = "" }: { className?: string }) {
  const pending = useLinkPending();
  return (
    <span
      data-link-pending={pending ? "" : undefined}
      className={`inline-flex items-center overflow-hidden transition-all duration-150 ${pending ? "ml-1.5 w-3 opacity-100" : "w-0 opacity-0"} ${className}`}
    >
      <Spinner size="sm" />
      {pending && <span className="sr-only">Loading</span>}
    </span>
  );
}

/** The "→" at the end of a link card; turns into a spinner while that card's page loads. Fixed size, so no jump. */
export function LinkArrow({ className = "" }: { className?: string }) {
  const pending = useLinkPending();
  return (
    <span data-link-pending={pending ? "" : undefined} className={`inline-flex w-5 justify-center ${className}`}>
      {pending ? (
        <>
          <Spinner className="text-indigo-600" />
          <span className="sr-only">Loading</span>
        </>
      ) : (
        <span aria-hidden="true" className="text-lg text-indigo-400 transition group-hover:translate-x-1 group-hover:text-indigo-600">
          →
        </span>
      )}
    </span>
  );
}
