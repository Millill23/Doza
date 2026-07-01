import { useState } from "react";

export default function ResetForm() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await r.json();
      setDone(data.message || "Если номер зарегистрирован, новый пароль отправлен по SMS.");
    } catch {
      setDone("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-ink-600/60 bg-ink-700 p-6 text-center">
        <p className="mb-4 text-sm text-ivory-muted">{done}</p>
        <a href="/login" className="inline-flex h-11 items-center rounded-full bg-gold-gradient px-6 text-sm font-medium text-ink-900">
          Войти
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="rs-phone" className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
            Телефон
          </label>
          <input
            id="rs-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required
            className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
            placeholder="+375 (__) ___-__-__"
          />
          <p className="mt-1.5 text-xs text-ivory-faint">
            Новый пароль придёт по SMS на этот номер.
          </p>
        </div>
        <button type="submit" disabled={loading} className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 disabled:opacity-60">
          {loading ? "…" : "Восстановить пароль"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-ivory-faint">
        Вспомнили? <a href="/login" className="text-gold-400 hover:text-gold-300">Войти</a>
      </p>
    </div>
  );
}
