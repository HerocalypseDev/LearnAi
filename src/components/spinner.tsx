const SIZES = { sm: "h-3 w-3", md: "h-4 w-4", lg: "h-6 w-6" } as const;

/**
 * Small spinning circle for things that are working. Always pair it with a text label ("Saving…"), never colour or
 * motion alone. With reduced motion on, globals.css stops the spin and the arc just sits still next to its label.
 */
export function Spinner({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <svg className={`${SIZES[size]} shrink-0 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Centered spinner and a short line of text, for simple fallbacks. */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-1 items-center justify-center gap-2 py-16 text-sm font-medium text-slate-500">
      <Spinner size="lg" className="text-indigo-500" />
      {label}
    </div>
  );
}

/** A thin progress bar with its percent, shared by file uploads and the writing editor. */
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-xs text-slate-500">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-slate-100"
      >
        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
