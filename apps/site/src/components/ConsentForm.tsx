import { useState } from "react";

/**
 * Кнопка подтверждения согласия на обработку ПД.
 * Само нажатие и есть согласие — по 99-З это активное осознанное действие.
 */
export default function ConsentForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/consent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await r.json();
      if (data.ok) setDone(true);
      else setErr(data.error || "Не удалось сохранить согласие");
    } catch {
      setErr("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 rounded-2xl border border-botanical-500/30 bg-botanical-500/5 p-8 text-center">
        <p className="mb-2 text-4xl">✓</p>
        <h2 className="mb-2 font-serif text-2xl text-ivory">Спасибо!</h2>
        <p className="text-sm text-ivory-muted">
          Согласие получено — теперь мы начисляем вам баллы за покупки.
        </p>
        <a
          href="/catalog"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gold-gradient px-8 text-sm font-medium text-ink-900"
        >
          В каталог
        </a>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}
      <button
        onClick={confirm}
        disabled={loading}
        className="h-12 w-full rounded-full bg-gold-gradient text-base font-medium text-ink-900 shadow-gold transition-all hover:shadow-gold-lg disabled:opacity-60"
      >
        {loading ? "Сохраняем…" : "Я согласен(на)"}
      </button>
      <p className="mt-3 text-center text-xs text-ivory-faint">
        Нажимая кнопку, вы даёте согласие на обработку своих персональных данных
        для целей программы лояльности.
      </p>
    </div>
  );
}
