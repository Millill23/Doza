"use client";

import { useRouter } from "next/navigation";

/**
 * Выбор месяца для блоков продаж.
 *
 * Отдельный список, а не пара дат: премия считается календарным месяцем, и
 * произвольный период («с 3 по 28») дал бы сумму, по которой платить нельзя.
 */
export default function MonthPicker({
  months,
  value,
  basePath,
  labelOf,
}: {
  /** Месяцы в формате `YYYY-MM`, от свежего к старому. */
  months: string[];
  value: string;
  basePath: string;
  /** Подписи месяцев, посчитанные на сервере: локаль там предсказуема. */
  labelOf: Record<string, string>;
}) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => {
        const m = e.target.value;
        // Текущий месяц – это адрес без параметра: так ссылка на дашборд
        // остаётся живой и завтра, и в следующем месяце.
        router.push(m === months[0] ? basePath : `${basePath}?month=${m}`);
      }}
      className="h-9 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
      aria-label="Месяц"
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {labelOf[m] ?? m}
        </option>
      ))}
    </select>
  );
}
