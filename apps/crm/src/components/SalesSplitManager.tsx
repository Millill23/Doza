"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getDaySales,
  saveSalesSplit,
  deleteSalesSplit,
} from "@/lib/actions/sales-splits";

interface Account {
  sellerId: number;
  name: string;
  sum: number;
  count: number;
}
interface Seller {
  id: number;
  name: string;
}
interface ExistingSplit {
  sourceSellerId: number;
  shares: { sellerId: number; percent: number }[];
}

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SalesSplitManager() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [day, setDay] = useState(today());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [splits, setSplits] = useState<ExistingSplit[]>([]);
  const [source, setSource] = useState<number>(0);
  const [shares, setShares] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const field =
    "h-10 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  function load(d: string) {
    start(async () => {
      try {
        setErr(null);
        setMsg(null);
        const data = await getDaySales(d);
        setAccounts(data.accounts);
        setSellers(data.sellers);
        setSplits(data.splits);
        // Если разделение уже задано — подставляем его для редактирования
        const first = data.splits[0];
        if (first) {
          setSource(first.sourceSellerId);
          const s: Record<number, string> = {};
          for (const x of first.shares) s[x.sellerId] = String(x.percent);
          setShares(s);
        } else {
          setSource(data.accounts[0]?.sellerId ?? 0);
          setShares({});
        }
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  useEffect(() => {
    load(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const sourceAccount = accounts.find((a) => a.sellerId === source);
  const totalPercent = Object.values(shares).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
              День
            </label>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className={field}
            />
          </div>
        </div>

        {accounts.length === 0 ? (
          <p className="text-sm text-ivory-faint">
            {pending ? "Загружаем…" : "За этот день закрытых продаж нет."}
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs uppercase tracking-wide text-gold-500">
              Выручка за день по аккаунтам
            </p>
            <ul className="mb-5 space-y-1.5">
              {accounts.map((a) => {
                const hasSplit = splits.some((s) => s.sourceSellerId === a.sellerId);
                return (
                  <li
                    key={a.sellerId}
                    className="flex items-center justify-between rounded-lg border border-ink-600/60 bg-ink-800 px-3 py-2 text-sm"
                  >
                    <span className="text-ivory">
                      {a.name}
                      <span className="ml-2 text-xs text-ivory-faint">
                        {a.count} чек(ов)
                      </span>
                      {hasSplit && (
                        <span className="ml-2 rounded-full bg-gold-gradient px-2 py-0.5 text-[10px] font-semibold text-ink-900">
                          разделено
                        </span>
                      )}
                    </span>
                    <span className="text-gold-400">{byn(a.sum)}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mb-4">
              <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
                Чью выручку делим
              </label>
              <select
                value={source}
                onChange={(e) => setSource(Number(e.target.value))}
                className={`${field} w-full`}
              >
                {accounts.map((a) => (
                  <option key={a.sellerId} value={a.sellerId}>
                    {a.name} — {byn(a.sum)}
                  </option>
                ))}
              </select>
            </div>

            <p className="mb-2 text-xs uppercase tracking-wide text-gold-500">
              Доли продавцов, %
            </p>
            <div className="space-y-2">
              {sellers.map((s) => {
                const pct = Number(shares[s.id] || 0);
                const part = sourceAccount
                  ? Math.round(((sourceAccount.sum * pct) / 100) * 100) / 100
                  : 0;
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-ivory">{s.name}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={shares[s.id] ?? ""}
                      onChange={(e) =>
                        setShares((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      placeholder="0"
                      className={`${field} w-24 text-right`}
                    />
                    <span className="w-28 text-right text-xs text-ivory-faint">
                      {pct > 0 ? byn(part) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            <p
              className={`mt-3 text-sm ${
                Math.abs(totalPercent - 100) < 0.01
                  ? "text-botanical-300"
                  : "text-ivory-faint"
              }`}
            >
              Сумма долей: {Math.round(totalPercent * 100) / 100}%
            </p>

            {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
            {msg && <p className="mt-2 text-sm text-green-300">{msg}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  start(async () => {
                    try {
                      setErr(null);
                      setMsg(null);
                      await saveSalesSplit({
                        day,
                        sourceSellerId: source,
                        shares: Object.entries(shares).map(([id, p]) => ({
                          sellerId: Number(id),
                          percent: Number(p) || 0,
                        })),
                      });
                      setMsg("Разделение сохранено.");
                      load(day);
                      router.refresh();
                    } catch (e) {
                      setErr((e as Error).message);
                    }
                  })
                }
                disabled={pending}
                className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
              >
                {pending ? "Сохраняем…" : "Сохранить разделение"}
              </button>

              {splits.some((s) => s.sourceSellerId === source) && (
                <button
                  onClick={() =>
                    start(async () => {
                      try {
                        setErr(null);
                        await deleteSalesSplit(day, source);
                        setMsg("Разделение убрано.");
                        load(day);
                        router.refresh();
                      } catch (e) {
                        setErr((e as Error).message);
                      }
                    })
                  }
                  disabled={pending}
                  className="rounded-full border border-ink-600 px-5 py-2.5 text-sm text-ivory-muted hover:border-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Убрать разделение
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
