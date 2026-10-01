import Link from "next/link";
import { logout } from "@/app/actions/auth";

export const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/homework", label: "Homework" },
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/settings", label: "Settings" },
];

export function TopBar({
  name,
  home,
  badge,
  links = [],
}: {
  name: string;
  home: string;
  badge?: string;
  links?: { href: string; label: string }[];
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href={home} className="flex items-center gap-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">🤖</span>
          <span className="hidden sm:inline">AI Class Homework</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">{name}</span>
          {badge && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{badge}</span>}
          <form action={logout}>
            <button className="rounded-lg px-3 py-1.5 text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">Log out</button>
          </form>
        </div>
      </div>
      {links.length > 0 && (
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 pb-2 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="shrink-0 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
