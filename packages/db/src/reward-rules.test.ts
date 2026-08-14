/**
 * Тесты правил подарков по датам.
 * Запуск: node --test packages/db/src/reward-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anniversaryIn,
  rewardWindow,
  issueYearFor,
  isBirthdayToday,
  occasionKey,
  isRewardUsable,
  daysLeft,
  minskHour,
  isRewardNotifyHour,
  todayInMinsk,
} from "./reward-rules.ts";

/** Локальный день — в таком виде приходит «сегодня». */
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
/** Дата из колонки `@db.Date`: Prisma отдаёт её полуночью UTC. */
const stored = (y: number, m: number, day: number) =>
  new Date(Date.UTC(y, m - 1, day));

test("день исходной даты читается в UTC, а не в местном времени", () => {
  // Колонка `date` возвращается как 1990-05-17T00:00:00Z. Локальные геттеры на
  // отрицательном смещении дали бы 16 мая — и подарок уехал бы на сутки.
  assert.deepEqual(anniversaryIn(stored(1990, 5, 17), 2026), d(2026, 5, 17));
  assert.equal(isBirthdayToday(stored(1990, 5, 17), d(2026, 5, 17)), true);
  assert.equal(issueYearFor(stored(1995, 8, 17), d(2026, 8, 14), 3), 2026);
});

test("годовщина переносит день и месяц в нужный год", () => {
  assert.deepEqual(anniversaryIn(stored(1990, 5, 17), 2026), d(2026, 5, 17));
});

test("29 февраля в невисокосный год отмечаем 28-го", () => {
  // Без этого new Date(2027, 1, 29) молча станет 1 марта.
  assert.deepEqual(anniversaryIn(stored(2000, 2, 29), 2027), d(2027, 2, 28));
  assert.deepEqual(anniversaryIn(stored(2000, 2, 29), 2028), d(2028, 2, 29));
  assert.deepEqual(anniversaryIn(stored(2000, 2, 29), 2100), d(2100, 2, 28)); // 2100 не високосный
});

test("окно скидки: 3 дня до и 7 после", () => {
  const w = rewardWindow(stored(1990, 5, 17), 2026, 3, 7);
  assert.deepEqual(w.anniversary, d(2026, 5, 17));
  assert.deepEqual(w.validFrom, d(2026, 5, 14));
  assert.equal(w.validUntil.getDate(), 24);
  assert.equal(w.validUntil.getMonth(), 4);
  // Последний день действует целиком, а не до полуночи его начала.
  assert.equal(w.validUntil.getHours(), 23);
});

test("день выдачи — ровно за 3 дня до даты", () => {
  const src = stored(1990, 5, 17);
  assert.equal(issueYearFor(src, d(2026, 5, 14), 3), 2026);
  assert.equal(issueYearFor(src, d(2026, 5, 13), 3), null);
  assert.equal(issueYearFor(src, d(2026, 5, 15), 3), null);
  assert.equal(issueYearFor(src, d(2026, 5, 17), 3), null);
});

test("дата в начале января: выдаём в конце декабря за следующий год", () => {
  // Ровно тот случай, на котором ломается наивная проверка «в этом году».
  const src = stored(1990, 1, 2);
  assert.equal(issueYearFor(src, d(2026, 12, 30), 3), 2027);
  assert.equal(issueYearFor(src, d(2026, 1, 30), 3), null);
});

test("день рождения определяется по дню и месяцу, а не по году", () => {
  assert.equal(isBirthdayToday(stored(1990, 5, 17), d(2026, 5, 17)), true);
  assert.equal(isBirthdayToday(stored(1990, 5, 17), d(2026, 5, 18)), false);
  // Родился 29 февраля — в 2027-м поздравляем 28-го, и только один раз.
  assert.equal(isBirthdayToday(stored(2000, 2, 29), d(2027, 2, 28)), true);
  assert.equal(isBirthdayToday(stored(2000, 2, 29), d(2027, 3, 1)), false);
});

test("ключ повода различает год и разные памятные даты", () => {
  assert.equal(occasionKey("birthday", 2026), "birthday-2026");
  assert.equal(occasionKey("memorable", 2026, 17), "date-17-2026");
  assert.notEqual(occasionKey("memorable", 2026, 17), occasionKey("memorable", 2027, 17));
  assert.notEqual(occasionKey("memorable", 2026, 17), occasionKey("memorable", 2026, 18));
});

test("использованная скидка больше не применяется", () => {
  const w = rewardWindow(stored(1990, 5, 17), 2026, 3, 7);
  const base = { validFrom: w.validFrom, validUntil: w.validUntil };
  assert.equal(isRewardUsable({ ...base, usedAt: null }, d(2026, 5, 15)), true);
  assert.equal(isRewardUsable({ ...base, usedAt: d(2026, 5, 15) }, d(2026, 5, 16)), false);
});

test("скидка не действует вне окна", () => {
  const w = rewardWindow(stored(1990, 5, 17), 2026, 3, 7);
  const r = { validFrom: w.validFrom, validUntil: w.validUntil, usedAt: null };
  assert.equal(isRewardUsable(r, d(2026, 5, 13)), false);
  assert.equal(isRewardUsable(r, d(2026, 5, 14)), true);
  assert.equal(isRewardUsable(r, d(2026, 5, 24)), true, "последний день ещё действует");
  assert.equal(isRewardUsable(r, d(2026, 5, 25)), false);
});

test("считаем, сколько дней осталось", () => {
  const w = rewardWindow(stored(1990, 5, 17), 2026, 3, 7);
  const r = { validFrom: w.validFrom, validUntil: w.validUntil, usedAt: null };
  assert.equal(daysLeft(r, d(2026, 5, 24)), 0, "сегодня последний день");
  assert.equal(daysLeft(r, d(2026, 5, 22)), 2);
});

// ─── Минское время ────────────────────────────────────────────────────────

test("час считается по Минску, а не по времени процесса", () => {
  // Беларусь круглый год живёт на UTC+3, перевода часов нет с 2011-го.
  assert.equal(minskHour(new Date("2026-08-14T08:00:00Z")), 11);
  assert.equal(minskHour(new Date("2026-01-14T08:00:00Z")), 11, "зимой без перевода");
  assert.equal(minskHour(new Date("2026-08-14T21:30:00Z")), 0, "переход через полночь");
});

test("рассылка только в 11 утра по Минску", () => {
  assert.equal(isRewardNotifyHour(new Date("2026-08-14T08:00:00Z")), true, "11:00 — да");
  assert.equal(isRewardNotifyHour(new Date("2026-08-14T08:59:00Z")), true, "11:59 — ещё да");
  assert.equal(isRewardNotifyHour(new Date("2026-08-14T07:59:00Z")), false, "10:59 — рано");
  assert.equal(isRewardNotifyHour(new Date("2026-08-14T09:00:00Z")), false, "12:00 — поздно");
  // В контейнере с UTC 11:00 по серверу — это 14:00 в Минске, слать нельзя.
  assert.equal(isRewardNotifyHour(new Date("2026-08-14T11:00:00Z")), false);
});

test("сегодняшний день берётся по Минску", () => {
  // 21:30 UTC — в Минске уже следующие сутки. Наивный расчёт поздравил бы днём раньше.
  const d1 = todayInMinsk(new Date("2026-08-14T21:30:00Z"));
  assert.equal(d1.getDate(), 15);
  assert.equal(d1.getMonth(), 7);
  const d2 = todayInMinsk(new Date("2026-08-14T20:30:00Z"));
  assert.equal(d2.getDate(), 14);
});
