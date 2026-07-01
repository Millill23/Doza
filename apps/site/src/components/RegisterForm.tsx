import { useState } from "react";

const inputCls =
  "h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none";
const labelCls = "mb-1.5 block text-xs uppercase tracking-luxe text-gold-500";

export default function RegisterForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/register/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setStep(2);
      setInfo(
        data.smsSent
          ? "Код подтверждения отправлен по SMS."
          : "Код создан (SMS не настроены — обратитесь к администратору).",
      );
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, code, password }),
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
      {step === 1 ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label htmlFor="r-name" className={labelCls}>Имя</label>
            <input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} placeholder="Как к вам обращаться" />
          </div>
          <div>
            <label htmlFor="r-phone" className={labelCls}>Телефон</label>
            <input id="r-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputCls} placeholder="+375 (__) ___-__-__" />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button type="submit" disabled={loading} className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 disabled:opacity-60">
            {loading ? "…" : "Получить код по SMS"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          {info && <p className="text-sm text-botanical-300">{info}</p>}
          <div>
            <label htmlFor="r-code" className={labelCls}>Код из SMS</label>
            <input id="r-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required className={inputCls} placeholder="000000" />
          </div>
          <div>
            <label htmlFor="r-pass" className={labelCls}>Придумайте пароль</label>
            <input id="r-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={inputCls} placeholder="минимум 6 символов" />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button type="submit" disabled={loading} className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 disabled:opacity-60">
            {loading ? "…" : "Зарегистрироваться"}
          </button>
          <button type="button" onClick={() => setStep(1)} className="w-full text-xs text-ivory-faint hover:text-gold-400">
            Изменить телефон
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-xs text-ivory-faint">
        Уже есть аккаунт? <a href="/login" className="text-gold-400 hover:text-gold-300">Войти</a>
      </p>
    </div>
  );
}
