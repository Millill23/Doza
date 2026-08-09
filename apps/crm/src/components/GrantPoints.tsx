"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  findCustomerForPoints,
  grantPoints,
  deductPoints,
} from "@/lib/actions/loyalty-manual";

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
  const [mode, setMode] = useState<"grant" | "deduct">("grant");
  const [done, setDone] = useState<{
    name: string;
    amount: number;
    balance: number;
    mode: "grant" | "deduct";
  } | null>(null);

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
    const isGrant = done.mode === "grant";
    return (
      <div
        className={`rounded-2xl border p-6 text-center ${
          isGrant
            ? "border-green-500/40 bg-green-500/5"
            : "border-red-400/40 bg-red-500/5"
        }`}
      >
        <p className="mb-1 text-ivory">{done.name}</p>
        <p
          className={`mb-1 text-2xl ${isGrant ? "text-gold-gradient" : "text-red-300"}`}
        >
          {isGrant ? "+" : "−"}
          {byn(done.amount)}
        </p>
        <p className="mb-4 text-sm text-ivory-muted">
          Баланс: {byn(done.balance)}
          {isGrant ? " · клиенту отправлена SMS" : ""}
        </p>
        <button
          onClick={reset}
          className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900"
        >
          {isGrant ? "Начислить ещё" : "Списать ещё"}
        </button>
      </div>
    );
  }

  const isGrant = mode === "grant";

  return (
    <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <h2 className="mb-3 font-serif text-xl text-ivory">Баллы вручную</h2>

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("grant");
            setErr(null);
          }}
          className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
            isGrant
              ? "border-gold-500 bg-gold-500/15 text-gold-300"
              : "border-ink-600 text-ivory-muted hover:border-gold-500"
          }`}
        >
          Начислить
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("deduct");
            setErr(null);
          }}
          className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
            !isGrant
              ? "border-red-400 bg-red-500/15 text-red-300"
              : "border-ink-600 text-ivory-muted hover:border-red-400"
          }`}
        >
          Списать
        </button>
      </div>

      <p className="mb-4 text-xs text-ivory-faint">
        {isGrant
          ? "Клиенту придёт SMS, в Telegram уйдёт оповещение с причиной."
          : "Списание идёт по тем же правилам, что и оплата баллами (сначала сгорающие). Клиенту SMS не отправляется, в Telegram уйдёт запись."}
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
              Клиент не найден — операция возможна только с существующим.
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
            {isGrant ? "Причина начисления" : "Причина списания"} (обязательно)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isGrant
                ? "напр. компенсация за задержку заказа"
                : "напр. ошибочное начисление, отмена покупки"
            }
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
              const payload = { phone, amount: Number(amount), reason };
              const res = isGrant
                ? await grantPoints(payload)
                : await deductPoints(payload);
              setDone({
                name: res.name,
                amount: res.amount,
                balance: res.balance,
                mode,
              });
              router.refresh();
            } catch (e) {
              setErr((e as Error).message);
            }
          })
        }
        disabled={pending || !phone.trim() || !amount.trim() || reason.trim().length < 3}
        className={`mt-4 rounded-full px-6 py-2.5 text-sm font-medium disabled:opacity-50 ${
          isGrant
            ? "bg-gold-gradient text-ink-900"
            : "border border-red-400/60 text-red-300 hover:bg-red-500/10"
        }`}
      >
        {pending
          ? isGrant
            ? "Начисляем…"
            : "Списываем…"
          : isGrant
            ? "Начислить баллы"
            : "Списать баллы"}
      </button>
    </div>
  );
}
