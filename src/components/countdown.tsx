"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const nowInSeconds = () => Math.floor(Date.now() / 1000);
const serverNow = () => null;

/** Live "2d 4h 13m 5s" countdown to a deadline. Renders nothing on the server to avoid clock mismatch. */
export function Countdown({ to, className = "" }: { to: string; className?: string }) {
  const now = useSyncExternalStore(subscribe, nowInSeconds, serverNow);
  if (now === null) return <span className={className}>&nbsp;</span>;

  const left = Math.floor(new Date(to).getTime() / 1000) - now;
  if (left <= 0) return <span className={className}>Deadline passed</span>;

  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const parts = d > 0 ? [`${d}d`, `${h}h`, `${m}m`] : [`${h}h`, `${m}m`, `${s}s`];

  return (
    <span className={`tabular-nums ${left < 3 * 3600 ? "text-red-600" : ""} ${className}`}>
      {parts.join(" ")} left
    </span>
  );
}
