/**
 * Тесты границ календарного дня.
 * Запуск: node --test packages/shared/src/day-range.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startOfDay, endOfDay, toDayString, isDayString } from "./day-range.ts";

test("день собирается в местном времени, а не в UTC", () => {
  // Ровно та ошибка, ради которой модуль и появился: new Date("2026-08-10")
  // разбирается как полночь UTC и в UTC+3 даёт 03:00 — день «съезжает».
  const start = startOfDay("2026-08-10");
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 7);
  assert.equal(start.getDate(), 10);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
});

test("конец дня включает его целиком", () => {
  // «Акция по 10 августа» должна работать весь день, а не до его начала.
  const end = endOfDay("2026-08-10");
  assert.equal(end.getDate(), 10);
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
  assert.equal(end.getSeconds(), 59);
  assert.equal(end.getMilliseconds(), 999);
});

test("покупка в 23:30 попадает в свой день", () => {
  const sale = new Date(2026, 7, 10, 23, 30);
  assert.ok(sale >= startOfDay("2026-08-10"));
  assert.ok(sale <= endOfDay("2026-08-10"));
  assert.ok(sale > endOfDay("2026-08-09"));
});

test("день и его строка переводятся друг в друга без сдвига", () => {
  for (const day of ["2026-01-01", "2026-08-10", "2026-12-31", "2028-02-29"]) {
    assert.equal(toDayString(startOfDay(day)), day, day);
    assert.equal(toDayString(endOfDay(day)), day, `${day} (конец дня)`);
  }
});

test("месяц и день дополняются нулями", () => {
  assert.equal(toDayString(new Date(2026, 0, 5)), "2026-01-05");
});

test("распознаём только формат YYYY-MM-DD", () => {
  assert.equal(isDayString("2026-08-10"), true);
  assert.equal(isDayString("2026-8-10"), false);
  assert.equal(isDayString("10.08.2026"), false);
  assert.equal(isDayString("2026-08-10T12:00:00Z"), false);
  assert.equal(isDayString(""), false);
  assert.equal(isDayString(null), false);
  assert.equal(isDayString(20260810), false);
});
