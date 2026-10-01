import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 animate-float items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl text-white shadow-xl shadow-indigo-500/40">
            🤖
          </div>
          <h1 className="bg-gradient-to-r from-indigo-700 to-violet-700 bg-clip-text text-3xl font-extrabold text-transparent">
            AI Class Homework
          </h1>
          <p className="mt-1 text-sm text-slate-500">Log in to see your homework</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
