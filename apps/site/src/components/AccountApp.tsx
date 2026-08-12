import { useState } from "react";
import PhoneInput from "./PhoneInput";
import { BELARUS_PREFIX } from "@doza/shared/phone";

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}
function ru(date: string) {
  return new Date(date).toLocaleDateString("ru-RU");
}

interface AccountData {
  found: boolean;
  name?: string;
  balance?: number;
  nextExpiry?: string | null;
  batches?: { amount: number; expiresAt: string | null }[];
  orders?: { id: number; date: string; total: number; status: string }[];
}

export default function AccountApp() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSearched(false);
    try {
      const r = await fetch(
        `/api/account?phone=${encodeURIComponent(BELARUS_PREFIX + phone)}`,
      );
      setData(await r.json());
    } catch {
      setData({ found: false });
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={lookup}
        className="mb-8 rounded-2xl border border-ink-600/60 bg-ink-700 p-6"
      >
        <label htmlFor="acc-phone" className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
          Ваш номер телефона
        </label>
        <div className="flex gap-2">
          <PhoneInput
            id="acc-phone"
            value={phone}
            onChange={setPhone}
            className="flex-1"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-gold-gradient px-6 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "…" : "Проверить"}
          </button>
        </div>
        <p className="mt-2 text-xs text-ivory-faint">
          Баллы привязаны к номеру телефона, который вы указываете при заказе.
        </p>
      </form>

      {searched && data && !data.found && (
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-8 text-center text-ivory-muted">
          По этому номеру пока нет данных. Сделайте первый заказ — и баллы появятся здесь.
        </div>
      )}

      {data?.found && (
        <div className="space-y-6">
          {/* Баланс */}
          <div className="rounded-2xl border border-gold-500/40 bg-ink-700 p-6 text-center shadow-gold">
            <p className="text-sm text-ivory-muted">
              {data.name}, ваш баланс баллов
            </p>
            <p className="my-2 font-serif text-5xl text-gold-gradient">
              {byn(data.balance ?? 0)}
            </p>
            {data.nextExpiry && (
              <p className="text-sm text-ivory-faint">
                Ближайшее сгорание: {ru(data.nextExpiry)}
              </p>
            )}
          </div>

          {/* Партии */}
          {data.batches && data.batches.length > 0 && (
            <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
              <h2 className="mb-4 font-serif text-xl text-ivory">Баллы по начислениям</h2>
              <ul className="space-y-2">
                {data.batches.map((b, i) => (
                  <li key={i} className="flex justify-between rounded-lg border border-ink-600/60 bg-ink-800 px-3 py-2 text-sm">
                    <span className="text-botanical-300">{byn(b.amount)}</span>
                    <span className="text-ivory-faint">
                      {b.expiresAt ? `сгорает ${ru(b.expiresAt)}` : "бессрочно"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* История заказов */}
          <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
            <h2 className="mb-4 font-serif text-xl text-ivory">История заказов</h2>
            {data.orders && data.orders.length > 0 ? (
              <ul className="divide-y divide-ink-600/40">
                {data.orders.map((o) => (
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
        </div>
      )}
    </div>
  );
}
