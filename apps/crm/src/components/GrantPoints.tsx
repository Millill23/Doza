"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findCustomerForPoints, grantPoints } from "@/lib/actions/loyalty-manual";

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}

export default function GrantPoints() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [found, setFound] = useState<{
    name: string;
    balance: number;
    vipCard: string | null;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; amount: number; balance: number } | null>(
    null,
  );

  const field =
    "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  function reset() {
    setPhone("");
    setAmount("");
    setReason("");
    setFound(null);
    setNotFound(false);
    setErr(null);
    setDone(null);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-500/40 bg-green-500/5 p-6 text-center">
        <p className="mb-1 text-ivory">{done.name}</p>
        <p className="mb-1 text-2xl text-gold-gradient">+{byn(done.amount)}</p>
        <p className="mb-4 text-sm text-ivory-muted">
          Баланс: {byn(done.balance)} · клиенту отправлена SMS
        </p>
        <button
          onClick={reset}
          className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900"
        >
          Начислить ещё
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <h2 className="mb-1 font-serif text-xl text-ivory">Начислить баллы</h2>
      <p className="mb-4 text-xs text-ivory-faint">
        Клиенту придёт SMS, в Telegram уйдёт оповещение с причиной.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Телефон клиента
          </label>
          <div className="flex gap-2">
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setFound(null);
                setNotFound(false);
              }}
              placeholder="+375…"
              className={field}
            />
            <button
              onClick={() =>
                start(async () => {
                  setErr(null);
                  const r = await findCustomerForPoints(phone);
                  if (r.found) {
                    setFound({ name: r.name, balance: r.balance, vipCard: r.vipCard });
                    setNotFound(false);
                  } else {
                    setFound(null);
                    setNotFound(true);
                  }
                })
              }
              disabled={pending}
              className="shrink-0 rounded-lg border border-gold-600/50 px-3 text-xs text-gold-400 hover:border-gold-500 disabled:opacity-50"
            >
              Найти
            </button>
          </div>
          {found && (
            <p className="mt-1.5 text-xs text-botanical-300">
              {found.name}, баланс: {byn(found.balance)}
              {found.vipCard && (
                <span className="ml-1 rounded-full bg-gold-gradient px-2 py-0.5 text-[10px] font-semibold text-ink-900">
                  ⭐ VIP
                </span>
              )}
            </p>
          )}
          {notFound && (
            <p className="mt-1.5 text-xs text-red-300">
              Клиент не найден — начислить можно только существующему.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Сколько баллов
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="напр. 50"
            className={field}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Причина начисления (обязательно)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="напр. компенсация за задержку заказа"
            className={field}
          />
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-red-300">{err}</p>}

      <button
        onClick={() =>
          start(async () => {
            try {
              setErr(null);
              const res = await grantPoints({
                phone,
                amount: Number(amount),
                reason,
              });
              setDone({ name: res.name, amount: res.amount, balance: res.balance });
              router.refresh();
            } catch (e) {
              setErr((e as Error).message);
            }
          })
        }
        disabled={pending || !phone.trim() || !amount.trim() || reason.trim().length < 3}
        className="mt-4 rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
      >
        {pending ? "Начисляем…" : "Начислить баллы"}
      </button>
    </div>
  );
}
