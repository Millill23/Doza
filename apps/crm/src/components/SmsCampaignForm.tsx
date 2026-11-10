"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatPhone } from "@doza/shared";
import { createSmsCampaign, searchSmsRecipients } from "@/lib/actions/sms-campaigns";

type Customer = Awaited<ReturnType<typeof searchSmsRecipients>>[number];
const field = "w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-ivory";
const button = "rounded-lg border border-gold-500 px-4 py-2 text-gold-300 disabled:opacity-50";

export default function SmsCampaignForm({ eligibleCount }: { eligibleCount: number }) {
  const router = useRouter();
  const requestId = useRef<string>();
  const [audience, setAudience] = useState<"all" | "selected">("selected");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>();
  const [selected, setSelected] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const count = audience === "all" ? eligibleCount : selected.length;

  async function search() {
    setSearching(true);
    setError("");
    try {
      setResults(await searchSmsRecipients(query));
    } catch {
      setError("Не удалось найти клиентов");
    } finally {
      setSearching(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !count || !text.trim()) return;
    const bonus = Number(points);
    const summary = bonus > 0
      ? `\nБаллы на клиента: ${bonus}. Всего до ${(count * bonus).toFixed(2)} баллов.`
      : "";
    if (!window.confirm(`Поставить в очередь SMS для ${count} получателей?${summary}\n\n${text.trim()}`)) return;
    setSubmitting(true);
    setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      const result = await createSmsCampaign({
        id: requestId.current,
        audience,
        expectedCount: count,
        customerIds: audience === "selected" ? selected.map(({ id }) => id) : [],
        text,
        points: bonus,
        reason,
      });
      if ("id" in result) {
        router.push(`/sms/campaigns/${result.id}`);
        router.refresh();
        return;
      }
      setError(result.error ?? "Не удалось создать рассылку");
    } catch {
      setError("Не удалось подтвердить создание рассылки. Повторите запуск с этой страницы.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="max-w-2xl rounded-xl border border-ink-600 bg-ink-700 p-5">
      <fieldset disabled={submitting} className="space-y-5">
        <div className="space-y-2">
          <label className="block">
            <input type="radio" name="audience" checked={audience === "selected"}
              onChange={() => setAudience("selected")} /> Выбрать клиентов
          </label>
          <label className="block">
            <input type="radio" name="audience" checked={audience === "all"}
              onChange={() => setAudience("all")} /> Все с подтверждённым согласием ({eligibleCount})
          </label>
        </div>

        {audience === "selected" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input className={field} aria-label="Поиск клиентов" placeholder="Имя или номер телефона"
                value={query} onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!searching) void search();
                  }
                }} />
              <button type="button" className={button} disabled={searching} onClick={search}>Найти</button>
            </div>
            {results && (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {results.length === 0 && <li>Клиенты не найдены.</li>}
                {results.map((customer) => (
                  <li key={customer.id}>
                    <button type="button" className="text-left text-sm text-gold-300 disabled:text-ivory-faint"
                      disabled={selected.some(({ id }) => id === customer.id)}
                      onClick={() => setSelected([...selected, customer])}>
                      + {customer.name} · {formatPhone(customer.phone)}
                    </button>
                  </li>
                ))}
                {results.length === 30 && <li className="text-xs text-ivory-faint">Показаны первые 30. Уточните поиск.</li>}
              </ul>
            )}
            {selected.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {selected.map((customer) => (
                  <li key={customer.id}>
                    <button type="button" className="rounded-lg border border-ink-600 px-2 py-1 text-sm"
                      aria-label={`Убрать ${customer.name} ${formatPhone(customer.phone)}`}
                      onClick={() => setSelected(selected.filter(({ id }) => id !== customer.id))}>
                      {customer.name} · {formatPhone(customer.phone)} ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block">Текст SMS · {text.length}/500</span>
          <textarea className={field} rows={4} maxLength={500} required
            value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block">Баллы каждому получателю</span>
          <input className={field} type="number" min="0" max="99999999.99" step="0.01" placeholder="0"
            value={points} onChange={(event) => setPoints(event.target.value)} />
        </label>
        {Number(points) > 0 && (
          <label className="block">
            <span className="mb-1 block">Причина для журнала лояльности</span>
            <input className={field} required minLength={3} maxLength={200}
              value={reason} onChange={(event) => setReason(event.target.value)} />
            <span className="mt-1 block text-xs text-ivory-faint">
              Баллы зачисляются перед первой попыткой и остаются на балансе при ошибке SMS.
            </span>
          </label>
        )}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <button className={button} disabled={!count || !text.trim() || submitting}>
          {submitting ? "Ставим в очередь…" : `Проверить и запустить · ${count}`}
        </button>
      </fieldset>
    </form>
  );
}
