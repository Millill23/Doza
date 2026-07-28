"use client";

import { useState, useTransition } from "react";
import { addAtomizer, deleteAtomizer } from "@/lib/actions/settings";

interface AtomizerItem {
  id: number;
  name: string;
  volumeMl: number;
}

export default function AtomizersManager({
  atomizers,
}: {
  atomizers: AtomizerItem[];
}) {
  const [name, setName] = useState("");
  const [volume, setVolume] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="mb-3 text-xs text-ivory-faint">
        Атомайзеры привязаны к объёму. В кассе продавец выбирает атомайзер,
        подходящий по объёму позиции.
      </p>
      <div className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название (напр. Спрей матовый)"
          className="h-10 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
        />
        <input
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          type="number" min={1}
          placeholder="мл"
          className="h-10 w-20 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
        />
        <button
          onClick={() => {
            if (!name.trim() || !volume) return;
            setErr(null);
            startTransition(async () => {
              try {
                await addAtomizer(name, Number(volume));
                setName("");
                setVolume("");
              } catch (e) {
                setErr((e as Error).message);
              }
            });
          }}
          disabled={pending}
          className="rounded-lg bg-gold-gradient px-4 text-sm font-medium text-ink-900 disabled:opacity-50"
        >
          Добавить
        </button>
      </div>
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
      {atomizers.length === 0 ? (
        <p className="text-sm text-ivory-faint">Атомайзеров пока нет.</p>
      ) : (
        <ul className="space-y-2">
          {atomizers.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-ink-600/60 bg-ink-800 px-3 py-2 text-sm"
            >
              <span className="text-ivory">
                {a.name}{" "}
                <span className="text-xs text-gold-400">· {a.volumeMl} мл</span>
              </span>
              <button
                onClick={() => {
                  startTransition(async () => {
                    await deleteAtomizer(a.id);
                  });
                }}
                disabled={pending}
                className="text-ivory-faint hover:text-red-300"
                title="Удалить"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
