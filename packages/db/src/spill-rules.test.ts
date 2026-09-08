/**
 * Тесты потерь при распиве.
 * Запуск: node --test packages/db/src/spill-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spillWriteOff,
  clampPercent,
  MAX_SPILL_PERCENT,
} from "./spill-rules.ts";

test("нулевой процент – учёт миллилитр в миллилитр", () => {
  const r = spillWriteOff(5, 0);
  assert.equal(r.deductMl, 5);
  assert.equal(r.spillMl, 0);
  assert.equal(r.carry, 0);
});

test("мелкий отлив копит потери, а не выбрасывает их", () => {
  // 5 мл при 5% – это 0.25 мл потерь. Округление вниз дало бы ноль, и
  // настройка не работала бы вовсе.
  const r = spillWriteOff(5, 5);
  assert.equal(r.deductMl, 5, "пока списываем ровно отлитое");
  assert.equal(r.carry, 25, "четверть миллилитра ждёт следующей продажи");
});

test("накопленный хвост списывается целым миллилитром", () => {
  let carry = 0;
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const r = spillWriteOff(5, 5, carry);
    carry = r.carry;
    total += r.deductMl;
  }
  assert.equal(total, 21, "четыре отлива по 5 мл забрали лишний миллилитр");
  assert.equal(carry, 0);
});

test("за флакон теряется обещанный процент", () => {
  // Двадцать отливов по 5 мл – это ровно 100 мл товара и ~5 мл потерь.
  let carry = 0;
  let total = 0;
  for (let i = 0; i < 20; i++) {
    const r = spillWriteOff(5, 5, carry);
    carry = r.carry;
    total += r.deductMl;
  }
  assert.equal(total, 105);
});

test("крупный отлив теряет свою долю сразу", () => {
  const r = spillWriteOff(30, 5);
  assert.equal(r.spillMl, 1);
  assert.equal(r.deductMl, 31);
  assert.equal(r.carry, 50);
});

test("дробный процент считается без потери копеек", () => {
  const r = spillWriteOff(10, 2.5);
  assert.equal(r.carry, 25);
  assert.equal(r.deductMl, 10);
});

test("нулевой объём не трогает накопленный хвост", () => {
  const r = spillWriteOff(0, 5, 70);
  assert.equal(r.deductMl, 0);
  assert.equal(r.carry, 70, "хвост дождётся настоящей продажи");
});

test("мусор на входе не ломает списание", () => {
  assert.equal(spillWriteOff(NaN, 5).deductMl, 0);
  assert.equal(spillWriteOff(-5, 5).deductMl, 0);
  assert.equal(spillWriteOff(10, NaN).deductMl, 10);
  assert.equal(spillWriteOff(10, -3).deductMl, 10);
  assert.equal(spillWriteOff(10, 5, -100).carry, 50);
});

test("процент ограничен сверху: выше – это опечатка, а не потери", () => {
  assert.equal(clampPercent(200), MAX_SPILL_PERCENT);
  assert.equal(clampPercent(5), 5);
  assert.equal(clampPercent(0), 0);
  assert.equal(clampPercent(2.55), 2.6);
});
