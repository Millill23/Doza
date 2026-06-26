"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Неверный email или пароль");
      return;
    }
    router.push(params.get("callbackUrl") || "/");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-ink-600/60 bg-ink-700 p-6"
    >
      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
          Email
        </label>
        <input
          id="email" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
          placeholder="admin@doza-parfum.by"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
          Пароль
        </label>
        <input
          id="password" type="password" required value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit" disabled={loading}
        className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
