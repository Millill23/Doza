"use client";

import { useMemo, useState, useTransition } from "react";
import { createOfflineSale, lookupCustomer } from "@/lib/actions/cash";

interface VolumeOpt {
  volumeMl: number;
  priceByn: number;
}
interface ProductOpt {
  id: number;
  name: string;
  brand: string;
  volumes: VolumeOpt[];
}
interface CartLine {
  productId: number;
  label: string;
  volumeMl: number;
  priceByn: number;
  qty: number;
}

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}

export default function CashRegister({ products }: { products: ProductOpt[] }) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState(0);
  const [foundName, setFoundName] = useState<string | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [spend, setSpend] = useState(0);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ saleId: number; toPay: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [query, products]);

  const total = cart.reduce((s, l) => s + l.priceByn * l.qty, 0);
  const maxSpend = Math.min(balance, total);
  const effSpend = usePoints ? Math.min(spend || maxSpend, maxSpend) : 0;
  const toPay = Math.max(0, Math.round((total - effSpend) * 100) / 100);

  function addLine(p: ProductOpt, v: VolumeOpt) {
    setCart((prev) => {
      const i = prev.findIndex(
        (l) => l.productId === p.id && l.volumeMl === v.volumeMl,
      );
      if (i >= 0) {
        const next = prev.slice();
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          label: `${p.brand} ${p.name}`,
          volumeMl: v.volumeMl,
          priceByn: v.priceByn,
          qty: 1,
        },
      ];
    });
  }

  function setQty(idx: number, qty: number) {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((_, i) => i !== idx);
      const next = prev.slice();
      next[idx] = { ...next[idx], qty };
      return next;
    });
  }

  function checkPhone() {
    startTransition(async () => {
      const r = await lookupCustomer(phone);
      setBalance(r.balance);
      setFoundName(r.found ? r.name : null);
      if (r.found && r.name && !name) setName(r.name);
    });
  }

  function closeSale() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await createOfflineSale({
          items: cart.map((l) => ({
            productId: l.productId,
            volumeMl: l.volumeMl,
            qty: l.qty,
          })),
          phone: phone || undefined,
          name: name || undefined,
          loyaltySpend: effSpend,
        });
        setDone({ saleId: res.saleId, toPay: res.toPay });
        setCart([]);
        setPhone("");
        setName("");
        setBalance(0);
        setFoundName(null);
        setUsePoints(false);
        setSpend(0);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-green-500/40 bg-green-500/5 p-8 text-center">
        <h2 className="mb-2 font-serif text-2xl text-green-300">Продажа закрыта</h2>
        <p className="mb-1 text-ivory-muted">Продажа №{done.saleId}</p>
        <p className="mb-6 text-ivory">Оплачено: {byn(done.toPay)}</p>
        <button
          onClick={() => setDone(null)}
          className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900"
        >
          Новая продажа
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Выбор товара */}
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск товара по бренду или названию…"
          className="mb-4 h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-4 text-sm text-ivory focus:border-gold-500 focus:outline-none"
        />
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-xl border border-ink-600/60 bg-ink-700 p-4">
              <div className="mb-2">
                <span className="text-[11px] uppercase tracking-wide text-gold-500">
                  {p.brand}
                </span>
                <div className="font-serif text-base text-ivory">{p.name}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.volumes.map((v) => (
                  <button
                    key={v.volumeMl}
                    onClick={() => addLine(p, v)}
                    className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:border-gold-500 hover:text-gold-300"
                  >
                    {v.volumeMl} мл · {byn(v.priceByn)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Корзина и закрытие */}
      <div className="space-y-4 rounded-2xl border border-ink-600/60 bg-ink-700 p-5 lg:sticky lg:top-8 lg:self-start">
        <h2 className="font-serif text-xl text-ivory">Чек</h2>

        {cart.length === 0 ? (
          <p className="text-sm text-ivory-faint">Добавьте товары из списка.</p>
        ) : (
          <ul className="space-y-2">
            {cart.map((l, idx) => (
              <li key={`${l.productId}-${l.volumeMl}`} className="flex items-center gap-2 text-sm">
                <div className="flex-1">
                  <div className="text-ivory">{l.label}</div>
                  <div className="text-xs text-ivory-faint">{l.volumeMl} мл · {byn(l.priceByn)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(idx, l.qty - 1)} className="h-7 w-7 rounded border border-ink-600 text-ivory-muted hover:border-gold-500">−</button>
                  <span className="w-6 text-center">{l.qty}</span>
                  <button onClick={() => setQty(idx, l.qty + 1)} className="h-7 w-7 rounded border border-ink-600 text-ivory-muted hover:border-gold-500">+</button>
                </div>
                <span className="w-20 text-right text-gold-400">{byn(l.priceByn * l.qty)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Клиент */}
        <div className="border-t border-ink-600/60 pt-4">
          <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
            Телефон клиента (для баллов)
          </label>
          <div className="flex gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+375…"
              className="h-10 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
            />
            <button
              onClick={checkPhone}
              disabled={pending}
              className="rounded-lg border border-gold-600/50 px-3 text-xs text-gold-400 hover:border-gold-500"
            >
              Найти
            </button>
          </div>
          {foundName && (
            <p className="mt-1.5 text-xs text-botanical-300">
              {foundName}, баланс: {byn(balance)}
            </p>
          )}
          {phone && !foundName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя нового клиента"
              className="mt-2 h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
            />
          )}
        </div>

        {balance > 0 && (
          <div className="rounded-lg border border-botanical-500/40 bg-botanical-700/20 p-3">
            <label className="flex items-center gap-2 text-sm text-ivory">
              <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} className="h-4 w-4 accent-botanical-500" />
              Списать баллы (до {byn(maxSpend)})
            </label>
            {usePoints && (
              <input
                type="number" min={0} max={maxSpend} step="0.01"
                value={spend || maxSpend}
                onChange={(e) => setSpend(Number(e.target.value))}
                className="mt-2 h-9 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
              />
            )}
          </div>
        )}

        {/* Итого */}
        <div className="space-y-1 border-t border-ink-600/60 pt-3 text-sm">
          <div className="flex justify-between text-ivory-muted">
            <span>Сумма</span><span>{byn(total)}</span>
          </div>
          {effSpend > 0 && (
            <div className="flex justify-between text-botanical-300">
              <span>Баллы</span><span>−{byn(effSpend)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-medium text-ivory">
            <span>К оплате</span><span className="text-gold-gradient">{byn(toPay)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button
          onClick={closeSale}
          disabled={pending || cart.length === 0}
          className="h-12 w-full rounded-full bg-gold-gradient text-base font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Закрываем…" : "Закрыть продажу"}
        </button>
      </div>
    </div>
  );
}
