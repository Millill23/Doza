"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCustomer } from "@/lib/actions/customers";
import PhoneInput from "@/components/PhoneInput";
import { BELARUS_PREFIX, toLocalDigits } from "@doza/shared/phone";

export default function CustomerEdit({
  customerId,
  name: initialName,
  phone: initialPhone,
}: {
  customerId: number;
  name: string;
  phone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  // В поле живут только 9 цифр — префикс рисует PhoneInput.
  const [phone, setPhone] = useState(toLocalDigits(initialPhone));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const field =
    "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setSaved(false);
        }}
        className="rounded-full border border-ink-600 px-4 py-2 text-xs text-ivory-muted transition-colors hover:border-gold-500 hover:text-gold-400"
      >
        ✏️ Изменить имя и телефон
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gold-600/40 bg-ink-700 p-4">
      <p className="mb-3 text-sm font-medium text-gold-300">
        Изменение данных клиента
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Имя
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя"
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Телефон
          </label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>
      </div>

      <p className="mt-2 text-xs text-ivory-faint">
        Телефон — идентификатор клиента: к нему привязаны баллы, заказы и вход в
        личный кабинет.
      </p>

      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      {saved && <p className="mt-2 text-sm text-green-300">Сохранено.</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() =>
            start(async () => {
              try {
                setErr(null);
                await updateCustomer(customerId, {
                  name,
                  phone: BELARUS_PREFIX + phone,
                });
                setSaved(true);
                setOpen(false);
                router.refresh();
              } catch (e) {
                setErr((e as Error).message);
              }
            })
          }
          disabled={pending}
          className="rounded-full bg-gold-gradient px-5 py-2 text-sm font-medium text-ink-900 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setName(initialName);
            setPhone(toLocalDigits(initialPhone));
            setErr(null);
          }}
          disabled={pending}
          className="rounded-full border border-ink-600 px-5 py-2 text-sm text-ivory-muted hover:border-gold-500 disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
