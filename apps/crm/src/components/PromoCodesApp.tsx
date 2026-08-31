"use client";

import { useState, useTransition } from "react";
import {
  createPromoCode,
  togglePromoCode,
  deletePromoCode,
} from "@/lib/actions/promo-codes";

interface Code {
  id: number;
  code: string;
  comment: string | null;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  influencer: { id: number; name: string } | null;
  uses: number;
}

const inputCls =
  "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none";
const labelCls = "mb-1 block text-xs uppercase tracking-wide text-gold-500";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

/** Дата в формате поля ввода: сегодня или через N дней. */
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function PromoCodesApp({
  codes,
  influencers,
}: {
  codes: Code[];
  influencers: { id: number; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [code, setCode] = useState("");
  const [comment, setComment] = useState("");
  const [percent, setPercent] = useState(10);
  const [from, setFrom] = useState(isoDay());
  const [to, setTo] = useState(isoDay(30));
  const [influencerId, setInfluencerId] = useState<number | "">("");

  function save() {
    setErr(null);
    startTransition(async () => {
      try {
        await createPromoCode({
          code,
          comment,
          discountPercent: percent,
          startsAt: from,
          endsAt: to,
          influencerId: influencerId === "" ? null : Number(influencerId),
        });
        setCode("");
        setComment("");
        setInfluencerId("");
        setOpen(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function act(fn: () => Promise<void>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const now = Date.now();

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-ivory">Промокоды</h1>
          <p className="mt-1 max-w-xl text-sm text-ivory-faint">
            Скидка по слову, которое называет покупатель. С другими скидками не
            складывается — применится то, что выгоднее клиенту.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900"
        >
          {open ? "Отмена" : "Новый промокод"}
        </button>
      </div>

      {err && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {err}
        </p>
      )}

      {open && (
        <div className="mb-6 rounded-2xl border border-ink-600/60 bg-ink-700 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Код</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="LETO20"
                className={inputCls + " uppercase"}
              />
              <p className="mt-1 text-xs text-ivory-faint">
                Регистр и пробелы не важны — покупатель наберёт как получится.
              </p>
            </div>
            <div>
              <label className={labelCls}>Скидка, %</label>
              <input
                type="number"
                min={1}
                max={100}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Действует с</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>по</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Блогер</label>
              <select
                value={influencerId}
                onChange={(e) =>
                  setInfluencerId(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputCls}
              >
                <option value="">Не привязан</option>
                {influencers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ivory-faint">
                Блогер увидит продажи по своему коду в разделе «Продажи».
              </p>
            </div>
            <div>
              <label className={labelCls}>Заметка</label>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Для чего заведён"
                className={inputCls}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="mt-4 rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
          >
            {pending ? "Сохраняем…" : "Завести промокод"}
          </button>
        </div>
      )}

      {codes.length === 0 ? (
        <p className="rounded-2xl border border-ink-600/60 bg-ink-700 p-8 text-center text-sm text-ivory-faint">
          Промокодов пока нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-600/60 bg-ink-700">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3 text-left">Код</th>
                <th className="px-4 py-3 text-left">Скидка</th>
                <th className="px-4 py-3 text-left">Срок</th>
                <th className="px-4 py-3 text-left">Блогер</th>
                <th className="px-4 py-3 text-left">Покупок</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired = new Date(c.endsAt).getTime() < now;
                return (
                  <tr key={c.id} className="border-t border-ink-600/40">
                    <td className="px-4 py-3">
                      <span className="font-mono text-ivory">{c.code}</span>
                      {c.comment && (
                        <div className="text-xs text-ivory-faint">{c.comment}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gold-400">
                      −{c.discountPercent}%
                    </td>
                    <td className="px-4 py-3 text-ivory-muted">
                      {day(c.startsAt)} — {day(c.endsAt)}
                      {expired && <div className="text-xs text-ivory-faint">истёк</div>}
                      {!c.isActive && (
                        <div className="text-xs text-ivory-faint">выключен</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ivory-muted">
                      {c.influencer?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ivory-muted">{c.uses}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => act(() => togglePromoCode(c.id, !c.isActive))}
                        disabled={pending}
                        className="mr-3 text-xs text-gold-400 hover:text-gold-300 disabled:opacity-50"
                      >
                        {c.isActive ? "Выключить" : "Включить"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const ok = confirm(
                            "Удалить промокод " +
                              c.code +
                              "? Заказы, оформленные по нему, останутся.",
                          );
                          if (ok) act(() => deletePromoCode(c.id));
                        }}
                        disabled={pending}
                        className="text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
