"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomer } from "@/lib/actions/customers";

/**
 * Удаление клиента админом. Действие необратимое, поэтому спрятано за
 * раскрытием и требует ввода имени: одного «Вы уверены?» мало, когда рядом
 * лежат живые баллы и история покупок.
 */
export default function CustomerDelete({
  customerId,
  name,
  balance,
  purchases,
}: {
  customerId: number;
  name: string;
  balance: number;
  purchases: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-ivory-faint underline-offset-2 transition-colors hover:text-red-300 hover:underline"
      >
        Удалить клиента
      </button>
    );
  }

  const confirmed = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
      <p className="mb-2 text-sm font-medium text-red-300">Удаление клиента</p>
      <ul className="mb-3 space-y-1 text-xs leading-relaxed text-ivory-muted">
        <li>• Баллы ({balance.toFixed(2)} BYN), памятные даты и история лояльности — удалятся безвозвратно.</li>
        <li>• Покупки ({purchases}) останутся в отчётах, но потеряют привязку к клиенту.</li>
        <li>• Если клиент вернётся, его придётся регистрировать заново.</li>
      </ul>

      <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
        Введите имя клиента для подтверждения
      </label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={name}
        className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-red-400 focus:outline-none"
      />

      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() =>
            start(async () => {
              try {
                setErr(null);
                await deleteCustomer(customerId);
                router.push("/customers");
                router.refresh();
              } catch (e) {
                setErr((e as Error).message);
              }
            })
          }
          disabled={pending || !confirmed}
          className="rounded-full border border-red-500/50 px-4 py-2 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-40"
        >
          {pending ? "Удаляем…" : "Удалить безвозвратно"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setTyped("");
            setErr(null);
          }}
          disabled={pending}
          className="rounded-full border border-ink-600 px-4 py-2 text-xs text-ivory-muted hover:border-gold-500 disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
