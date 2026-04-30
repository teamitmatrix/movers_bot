import { Suspense } from "react";

import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-20">
      <Suspense
        fallback={
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                Admin Login
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
            </div>
            <p className="text-sm text-slate-500">Loading login form...</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}