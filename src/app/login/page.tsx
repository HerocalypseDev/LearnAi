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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white shadow-lg">
            🤖
          </div>
          <h1 className="text-2xl font-bold">AI Class Homework</h1>
          <p className="mt-1 text-sm text-slate-500">Log in to see your homework</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
