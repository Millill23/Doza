"use client";

import { useMemo, useState, useTransition } from "react";
import { saveWeeklyPromo, removeWeeklyPromo } from "@/lib/actions/weekly-promo";

interface Product {
  id: number;
  label: string;
}

interface Active {
  id: number;
  name: string;
  discountPercent: number;
  endsAt: string;
  productIds: number[];
}

interface HistoryRow {
  id: number;
  name: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  count: number;
}

const inputCls =
  "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none";
const labelCls = "mb-1 block text-xs uppercase tracking-wide text-gold-500";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

export default function WeeklyPromoApp({
  active,
  products,
  history,
  defaultDays,
}: {
  active: Active | null;
  products: Product[];
  history: HistoryRow[];
  defaultDays: number;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("Парфюм недели");
  const [percent, setPercent] = useState(20);
  const [days, setDays] = useState(defaultDays);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<number[]>([]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter((p) => p.label.toLowerCase().includes(q))
      : products;
    return list.slice(0, 60);
  }, [query, products]);

  const pickedSet = new Set(picked);

  function toggle(id: number) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function save() {
    setErr(null);
    startTransition(async () => {
      try {
        await saveWeeklyPromo({
          name,
          discountPercent: percent,
          productIds: picked,
          days,
        });
        setPicked([]);
        setQuery("");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function remove(id: number) {
    setErr(null);
    startTransition(async () => {
      try {
        await removeWeeklyPromo(id);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const label = new Map(products.map((p) => [p.id, p.label]));

  return (
    <div>
      <h1 className="font-serif text-3xl text-ivory">Парфюм недели</h1>
      <p className="mt-1 max-w-2xl text-sm text-ivory-faint">
        Подборка ароматов с одинаковой скидкой. В каталоге на сайте появляется
        отдельной кнопкой. Скидка не складывается с другими — покупателю
        посчитается то, что для него выгоднее.
      </p>

      {err && (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {err}
        </p>
      )}

      {active && (
        <div className="mt-6 rounded-2xl border border-botanical-500/40 bg-botanical-700/15 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-xl text-ivory">
                Сейчас идёт: {active.name}
              </h2>
              <p className="mt-1 text-sm text-ivory-muted">
                Скидка {active.discountPercent}% на {active.productIds.length}{" "}
                {active.productIds.length === 1 ? "аромат" : "ароматов"} · до{" "}
                {day(active.endsAt)}
              </p>
              <p className="mt-2 text-xs text-ivory-faint">
                {active.productIds
                  .map((id) => label.get(id) ?? "товар " + id)
                  .join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const ok = confirm(
                  "Убрать подборку? Скидки на эти ароматы пропадут сразу.",
                );
                if (ok) remove(active.id);
              }}
              disabled={pending}
              className="shrink-0 rounded-lg border border-red-500/40 px-4 py-2 text-xs text-red-300 hover:border-red-400 disabled:opacity-50"
            >
              Убрать
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-ink-600/60 bg-ink-700 p-5">
        <h2 className="mb-4 font-serif text-xl text-ivory">
          {active ? "Заменить подборку" : "Собрать подборку"}
        </h2>
        {active && (
          <p className="mb-4 text-xs text-ivory-faint">
            Текущая подборка выключится: двух «Парфюмов недели» сразу быть не
            должно — в каталоге одна кнопка.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
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
            <label className={labelCls}>Длится, дней</label>
            <input
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls}>
            Ароматы {picked.length > 0 && "· выбрано " + picked.length}
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по бренду или названию"
            className={inputCls}
          />
          <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-ink-600/60 p-2">
            {found.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                  (pickedSet.has(p.id)
                    ? "bg-gold-500/10 text-gold-300"
                    : "text-ivory-muted hover:bg-ink-600/40")
                }
              >
                <span
                  className={
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " +
                    (pickedSet.has(p.id)
                      ? "border-gold-500 bg-gold-500 text-ink-900"
                      : "border-ink-600")
                  }
                >
                  {pickedSet.has(p.id) ? "✓" : ""}
                </span>
                {p.label}
              </button>
            ))}
            {found.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-ivory-faint">
                Ничего не нашлось.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={pending || picked.length === 0}
          className="mt-4 rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Запустить подборку"}
        </button>
      </div>

      {history.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-ink-600/60 bg-ink-700">
          <div className="border-b border-ink-600/40 bg-ink-800 px-5 py-3 text-sm text-ivory">
            Прошлые подборки
          </div>
          <table className="w-full text-sm">
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-ink-600/30">
                  <td className="px-5 py-2.5 text-ivory">{h.name}</td>
                  <td className="px-5 py-2.5 text-gold-400">−{h.discountPercent}%</td>
                  <td className="px-5 py-2.5 text-ivory-muted">
                    {h.count} {h.count === 1 ? "аромат" : "ароматов"}
                  </td>
                  <td className="px-5 py-2.5 text-ivory-faint">
                    {day(h.startsAt)} — {day(h.endsAt)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {h.isActive ? (
                      <span className="text-xs text-botanical-300">идёт</span>
                    ) : (
                      <span className="text-xs text-ivory-faint">завершена</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
