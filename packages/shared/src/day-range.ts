/**
 * Границы календарного дня в местном времени.
 *
 * Нужно там, где пользователь выбирает только дату (без часов): акции и
 * фильтры аналитики. `new Date("2026-08-10")` разбирается как полночь UTC —
 * в UTC+3 это 03:00 местного времени, из-за чего день «съезжает». Поэтому
 * собираем дату из компонентов явно.
 */

/** Начало дня (00:00:00.000) по местному времени. */
export function startOfDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Конец дня (23:59:59.999) по местному времени.
 * Важно для акций: «действует по 10 августа» означает включительно весь день,
 * а не до его начала.
 */
export function endOfDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

/** Дата в формате YYYY-MM-DD по местному времени (для input[type=date]). */
export function toDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Похоже ли значение на дату YYYY-MM-DD. */
export function isDayString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
