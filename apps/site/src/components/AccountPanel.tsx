import { useState } from "react";

interface Batch {
  amount: number;
  expiresAt: string | null;
}
interface Order {
  id: number;
  date: string;
  total: number;
  status: string;
}
interface Props {
  name: string;
  phone: string;
  balance: number;
  batches: Batch[];
  orders: Order[];
}

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}
function ru(d: string) {
  return new Date(d).toLocaleDateString("ru-RU");
}

export default function AccountPanel({ name, phone, balance, batches, orders }: Props) {
  const [showPass, setShowPass] = useState(false);
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const r = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.error || "Ошибка");
        return;
      }
      setMsg("Пароль изменён.");
      setOld("");
      setNew("");
      setShowPass(false);
    } catch {
      setErr("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-serif text-2xl text-ivory">{name}</p>
          <p className="text-sm text-ivory-faint">{phone}</p>
        </div>
        <button onClick={logout} className="rounded-full border border-ink-600 px-4 py-2 text-sm text-ivory-muted transition-colors hover:border-gold-600/60 hover:text-gold-400">
          Выйти
        </button>
      </div>

      {/* Баланс */}
      <div className="rounded-2xl border border-gold-500/40 bg-ink-700 p-6 text-center shadow-gold">
        <p className="text-sm text-ivory-muted">Баланс баллов</p>
        <p className="my-2 font-serif text-5xl text-gold-gradient">{byn(balance)}</p>
      </div>

      {/* Партии */}
      {batches.length > 0 && (
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Баллы по начислениям</h2>
          <ul className="space-y-2">
            {batches.map((b, i) => (
              <li key={i} className="flex justify-between rounded-lg border border-ink-600/60 bg-ink-800 px-3 py-2 text-sm">
                <span className="text-botanical-300">{byn(b.amount)}</span>
                <span className="text-ivory-faint">{b.expiresAt ? `сгорает ${ru(b.expiresAt)}` : "бессрочно"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* История */}
      <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
        <h2 className="mb-4 font-serif text-xl text-ivory">История заказов</h2>
        {orders.length ? (
          <ul className="divide-y divide-ink-600/40">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <span className="text-ivory">Заказ #{o.id}</span>
                  <span className="ml-2 text-xs text-ivory-faint">{ru(o.date)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-ivory-muted">{o.status}</span>
                  <span className="text-gold-400">{byn(o.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ivory-faint">Заказов пока нет.</p>
        )}
      </div>

      {/* Смена пароля */}
      <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
        <button onClick={() => setShowPass((v) => !v)} className="text-sm text-gold-400 hover:text-gold-300">
          {showPass ? "Скрыть" : "Сменить пароль"}
        </button>
        {msg && <p className="mt-2 text-sm text-botanical-300">{msg}</p>}
        {showPass && (
          <form onSubmit={changePassword} className="mt-4 space-y-3">
            <input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} required placeholder="Текущий пароль"
              className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
            <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required minLength={6} placeholder="Новый пароль (мин. 6)"
              className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
            {err && <p className="text-sm text-red-300">{err}</p>}
            <button type="submit" disabled={busy} className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 disabled:opacity-60">
              {busy ? "…" : "Сохранить пароль"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
