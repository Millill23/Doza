"use client";

import { useState, useTransition } from "react";
import {
  addCustomerDate,
  removeCustomerDate,
  setBirthday,
} from "@/lib/actions/customers";

interface DateItem {
  id: number;
  date: string;
  description: string;
}

export default function CustomerDates({
  customerId,
  birthday,
  dates,
}: {
  customerId: number;
  birthday: string | null;
  dates: DateItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [bday, setBday] = useState(birthday ?? "");
  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {/* День рождения */}
      <div>
        <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
          День рождения
        </label>
        <div className="flex gap-2">
          <input
            type="date"
            value={bday}
            onChange={(e) => setBday(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
          />
          <button
            onClick={() => startTransition(() => setBirthday(customerId, bday))}
            disabled={pending}
            className="rounded-lg border border-gold-600/50 px-3 text-xs text-gold-400 hover:border-gold-500"
          >
            Сохранить
          </button>
        </div>
      </div>

      {/* Памятные даты */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-gold-500">
          Памятные даты (до 3)
        </p>
        <ul className="mb-3 space-y-2">
          {dates.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-ink-600/60 bg-ink-800 px-3 py-2 text-sm"
            >
              <span className="text-ivory">
                {new Date(d.date).toLocaleDateString("ru-RU")} — {d.description}
              </span>
              <button
                onClick={() =>
                  startTransition(() => removeCustomerDate(d.id, customerId))
                }
                className="text-ivory-faint hover:text-red-300"
                aria-label="Удалить"
              >
                ✕
              </button>
            </li>
          ))}
          {dates.length === 0 && (
            <li className="text-sm text-ivory-faint">Нет памятных дат.</li>
          )}
        </ul>

        {dates.length < 3 && (
          <div className="space-y-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Например: день рождения жены"
              className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
            />
            <button
              onClick={() => {
                setErr(null);
                startTransition(async () => {
                  try {
                    await addCustomerDate(customerId, newDate, newDesc);
                    setNewDate("");
                    setNewDesc("");
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                });
              }}
              disabled={pending || !newDate || !newDesc}
              className="w-full rounded-lg bg-gold-gradient py-2 text-sm font-medium text-ink-900 disabled:opacity-50"
            >
              Добавить дату
            </button>
            {err && <p className="text-sm text-red-300">{err}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
