import { useState } from "react";

const inputCls =
  "h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none";
const labelCls = "mb-1.5 block text-xs uppercase tracking-luxe text-gold-500";

export default function LoginForm() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      window.location.href = "/account";
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="l-phone" className={labelCls}>Телефон</label>
          <input id="l-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputCls} placeholder="+375 (__) ___-__-__" />
        </div>
        <div>
          <label htmlFor="l-pass" className={labelCls}>Пароль</label>
          <input id="l-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className={inputCls} placeholder="••••••••" />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={loading} className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 disabled:opacity-60">
          {loading ? "…" : "Войти"}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-xs text-ivory-faint">
        <a href="/reset" className="hover:text-gold-400">Забыли пароль?</a>
        <a href="/register" className="text-gold-400 hover:text-gold-300">Регистрация</a>
      </div>
    </div>
  );
}
