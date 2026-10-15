import type { ReactNode } from "react";
import { ADMIN_LINKS, TopBar } from "./top-bar";

// Route loading screens (used by the loading.tsx files). Each one copies the shape of its page, so the real page
// replaces it without the layout jumping. With reduced motion on, the pulse slows down (globals.css) instead of stopping.

/** Base pulsing block. Give it a height and width. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;
}

const card = "rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200";

/** The page body, announced once to screen readers as loading. */
function Main({ label, className = "space-y-6", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <main role="status" aria-busy="true" aria-live="polite" className={`mx-auto w-full max-w-3xl px-4 py-6 ${className}`}>
      <span className="sr-only">{label}</span>
      {children}
    </main>
  );
}

/** Same height as the student TopBar, whose name isn't known until the page loads. */
function StudentTopBarSkeleton() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/75 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg text-white shadow-md shadow-indigo-500/30">
            🤖
          </span>
          <Skeleton className="hidden h-4 w-36 sm:block" />
        </span>
        <span className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-20 rounded-xl" />
        </span>
      </div>
    </header>
  );
}

/** The admin menu needs no data, so the real one shows while the page loads (and stays clickable). */
function AdminTopBar() {
  return <TopBar name="Admin" home="/admin" badge="Teacher" links={ADMIN_LINKS} />;
}

function CardRows({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <ul className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A few label + input shapes and a button. */
export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-9 w-28 rounded-xl" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <>
      <StudentTopBarSkeleton />
      <Main label="Loading your homework…">
        <section className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </section>
        <section className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl bg-amber-200/60" />
          <Skeleton className="h-24 rounded-2xl bg-indigo-200/60" />
        </section>
        <section className={card}>
          <Skeleton className="mb-3 h-4 w-32" />
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-3 rounded-full" />
            ))}
          </div>
        </section>
        <section>
          <Skeleton className="mb-2 h-4 w-24" />
          <CardRows rows={3} />
        </section>
      </Main>
    </>
  );
}

export function HomeworkSkeleton() {
  return (
    <>
      <StudentTopBarSkeleton />
      <Main label="Loading the homework…" className="space-y-5">
        <Skeleton className="h-4 w-36" />
        <section className={card}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-3.5 w-40" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-4 w-32" />
        </section>
        {[4, 2].map((options, s) => (
          <section key={s} className={card}>
            <div className="mb-3 flex justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <Skeleton className="h-4 w-3/4" />
              {Array.from({ length: options }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-xl" />
              ))}
            </div>
          </section>
        ))}
        <section className={card}>
          <Skeleton className="mb-3 h-5 w-24" />
          <Skeleton className="mb-4 h-20 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </section>
      </Main>
    </>
  );
}

export function AdminSkeleton() {
  return (
    <>
      <AdminTopBar />
      <Main label="Loading the overview…">
        <Skeleton className="h-8 w-36" />
        <section className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <CardRows rows={2} />
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <Skeleton className="h-5 w-32" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-14 rounded-xl" />
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            </div>
          ))}
        </section>
        <section className={card}>
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </section>
      </Main>
    </>
  );
}

/** Admin homework list. */
export function AdminListSkeleton() {
  return (
    <>
      <AdminTopBar />
      <Main label="Loading homework…" className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>
        <CardRows rows={4} />
      </Main>
    </>
  );
}

/** New homework: back link, title and the short form. */
export function AdminNewHomeworkSkeleton() {
  return (
    <>
      <AdminTopBar />
      <Main label="Loading…" className="space-y-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-48" />
        <section className={card}>
          <FormSkeleton fields={3} />
        </section>
      </Main>
    </>
  );
}

/** One homework's admin page: students' work, the homework form, then the question sections. */
export function AdminHomeworkSkeleton() {
  return (
    <>
      <AdminTopBar />
      <Main label="Loading the homework…" className="space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
        <section className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </section>
        <section className={card}>
          <Skeleton className="mb-4 h-6 w-1/2" />
          <FormSkeleton fields={2} />
        </section>
        {[0, 1].map((i) => (
          <section key={i} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-3/4" />
            <div className={card}>
              <FormSkeleton fields={3} />
            </div>
          </section>
        ))}
      </Main>
    </>
  );
}

/** Marking one child's homework. */
export function MarkSkeleton() {
  return (
    <>
      <AdminTopBar />
      <Main label="Loading the marking page…" className="space-y-5">
        <Skeleton className="h-4 w-40" />
        <section className={card}>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-6 w-2/3" />
          <Skeleton className="mt-2 h-4 w-48" />
        </section>
        <section className={card}>
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </section>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-16 rounded-xl" />
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
        </section>
      </Main>
    </>
  );
}

/** Activity: export buttons, filter chips and a day-by-day log. */
export function ActivitySkeleton() {
  return (
    <>
      <AdminTopBar />
      <Main label="Loading activity…" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-8 w-32" />
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-xl" />
            ))}
          </div>
        </div>
        {[4, 7].map((chips, row) => (
          <div key={row} className="flex gap-2 overflow-hidden">
            {Array.from({ length: chips }, (_, i) => (
              <Skeleton key={i} className="h-6 w-20 shrink-0 rounded-full" />
            ))}
          </div>
        ))}
        {[5, 3].map((lines, d) => (
          <section key={d} className={card}>
            <Skeleton className="mb-3 h-4 w-40" />
            <div className="space-y-2.5">
              {Array.from({ length: lines }, (_, i) => (
                <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-2">
                  <Skeleton className="h-3.5" />
                  <Skeleton className="h-3.5 w-3/4" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </Main>
    </>
  );
}

/** Attendance: a summary per child, then one form per Sunday. */
export function AttendanceSkeleton() {
  return (
    <>
      <AdminTopBar />
      <Main label="Loading attendance…" className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <section className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </section>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <Skeleton className="h-4 w-48" />
            {[0, 1].map((j) => (
              <div key={j} className="grid gap-2 sm:grid-cols-[6rem_auto_1fr] sm:items-center">
                <Skeleton className="h-4 w-16" />
                <div className="flex gap-1">
                  <Skeleton className="h-8 w-20 rounded-xl" />
                  <Skeleton className="h-8 w-20 rounded-xl" />
                </div>
                <Skeleton className="h-10 rounded-xl" />
              </div>
            ))}
            <Skeleton className="h-9 w-20 rounded-xl" />
          </div>
        ))}
      </Main>
    </>
  );
}

export function SettingsSkeleton() {
  return (
    <>
      <AdminTopBar />
      <Main label="Loading settings…">
        <Skeleton className="h-8 w-32" />
        <section className={card}>
          <Skeleton className="mb-1 h-4 w-28" />
          <Skeleton className="mb-4 h-3.5 w-3/4" />
          <FormSkeleton fields={2} />
        </section>
        <section className={card}>
          <Skeleton className="mb-2 h-4 w-20" />
          <Skeleton className="h-3.5 w-full" />
        </section>
        <section className={card}>
          <Skeleton className="mb-4 h-4 w-28" />
          <FormSkeleton fields={3} />
        </section>
      </Main>
    </>
  );
}

/** Login: the robot and title, and the card's shape. */
export function LoginSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-live="polite" className="flex flex-1 items-center justify-center px-4 py-12">
      <span className="sr-only">Loading…</span>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl text-white shadow-xl shadow-indigo-500/40">
            🤖
          </div>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <div className="space-y-4 rounded-3xl bg-white/90 p-6 shadow-xl shadow-indigo-500/10 ring-1 ring-slate-200">
          <FormSkeleton fields={2} />
        </div>
      </div>
    </main>
  );
}
