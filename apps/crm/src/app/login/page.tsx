import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-serif text-4xl font-semibold tracking-[0.15em] text-gold-gradient">
            DOZA
          </span>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-ivory-faint">
            CRM
          </p>
        </div>

        <Suspense fallback={<div className="h-64 rounded-2xl border border-ink-600/60 bg-ink-700" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
