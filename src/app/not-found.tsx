import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <div className="text-4xl">🤖❓</div>
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="text-slate-500">This page doesn&apos;t exist.</p>
      <Link href="/" className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700">
        Go home
      </Link>
    </main>
  );
}
