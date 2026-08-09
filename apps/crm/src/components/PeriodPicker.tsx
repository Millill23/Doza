"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** Дата YYYY-MM-DD по местному времени. */
function toDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDay(d);
}

function monthStartDay(): string {
  const d = new Date();
  return toDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function PeriodPicker({
  from: initialFrom,
  to: initialTo,
}: {
  from: string;
  to: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const field =
    "h-10 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  function apply(nextFrom: string, nextTo: string) {
    const q = new URLSearchParams(params.toString());
    if (nextFrom) q.set("from", nextFrom);
    else q.delete("from");
    if (nextTo) q.set("to", nextTo);
    else q.delete("to");
    router.push(`/analytics?${q.toString()}`);
  }

  const presets: { label: string; from: string; to: string }[] = [
    { label: "7 дней", from: daysAgo(6), to: toDay(new Date()) },
    { label: "30 дней", from: daysAgo(29), to: toDay(new Date()) },
    { label: "Этот месяц", from: monthStartDay(), to: toDay(new Date()) },
    { label: "Всё время", from: "", to: "" },
  ];

  const active = (p: { from: string; to: string }) =>
    p.from === initialFrom && p.to === initialTo;

  return (
    <div className="mb-6 rounded-2xl border border-ink-600/60 bg-ink-700 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            С
          </label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            По
          </label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={field}
          />
        </div>
        <button
          onClick={() => apply(from, to)}
          className="h-10 rounded-full bg-gold-gradient px-5 text-sm font-medium text-ink-900"
        >
          Применить
        </button>

        <div className="ml-auto flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setFrom(p.from);
                setTo(p.to);
                apply(p.from, p.to);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active(p)
                  ? "border-gold-500 bg-gold-500/15 text-gold-300"
                  : "border-ink-600 text-ivory-muted hover:border-gold-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-ivory-faint">
        {initialFrom || initialTo
          ? `Период: ${initialFrom || "начало"} → ${initialTo || "сегодня"}`
          : "Период: всё время"}
      </p>
    </div>
  );
}
