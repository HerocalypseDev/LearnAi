import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "./nav-links";
import { smallSecondaryButtonClass } from "./ui";

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
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/75 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href={home} className="group flex items-center gap-2 font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg text-white shadow-md shadow-indigo-500/30 transition group-hover:rotate-12 group-hover:scale-110">
            🤖
          </span>
          <span className="hidden bg-gradient-to-r from-indigo-700 to-violet-700 bg-clip-text text-transparent sm:inline">
            AI Class Homework
          </span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
              {name.slice(0, 1).toUpperCase()}
            </span>
            {name}
          </span>
          {badge && <span className="hidden rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 sm:inline">{badge}</span>}
          <form action={logout}>
            <button className={smallSecondaryButtonClass}>Log out</button>
          </form>
        </div>
      </div>
      {links.length > 0 && <NavLinks links={links} />}
    </header>
  );
}
