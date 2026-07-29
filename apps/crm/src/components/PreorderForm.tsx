"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPreorder } from "@/lib/actions/preorders";

export default function PreorderForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [wish, setWish] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const field =
    "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  return (
    <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <h2 className="mb-4 font-serif text-xl text-ivory">Новая заявка</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Имя клиента
          </label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Имя"
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Телефон
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+375…"
            className={field}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Что хочет клиент (бренд, аромат, объём флакона)
          </label>
          <textarea
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            rows={2}
            placeholder="напр. Xerjoff Naxos, полный флакон 100 мл"
            className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ivory focus:border-gold-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Комментарий (необязательно)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Доп. детали, сроки, договорённости"
            className={field}
          />
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      <button
        onClick={() =>
          start(async () => {
            try {
              setErr(null);
              await createPreorder({ customerName, phone, wish, note });
              setCustomerName("");
              setPhone("");
              setWish("");
              setNote("");
              router.refresh();
            } catch (e) {
              setErr((e as Error).message);
            }
          })
        }
        disabled={pending}
        className="mt-4 rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
      >
        {pending ? "Создаём…" : "Создать заявку"}
      </button>
    </div>
  );
}
