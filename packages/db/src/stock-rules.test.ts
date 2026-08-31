/**
 * Тесты проверки наличия.
 * Запуск: node --test packages/db/src/stock-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  neededMl,
  shortages,
  shortageMessage,
  justRanLow,
  lowStockMessage,
  LOW_STOCK_ML,
} from "./stock-rules.ts";

const line = (productId: number, volumeMl: number, qty: number, label = "Аромат") => ({
  productId,
  volumeMl,
  qty,
  label,
});

test("нужный объём считается по товару целиком", () => {
  // Две позиции одного аромата льются из одного флакона: 5×2 + 10 = 20 мл.
  const need = neededMl([line(1, 5, 2), line(1, 10, 1)]);
  assert.equal(need.get(1), 20);
});

test("разные товары не смешиваются", () => {
  const need = neededMl([line(1, 5, 1), line(2, 10, 3)]);
  assert.equal(need.get(1), 5);
  assert.equal(need.get(2), 30);
});

test("нехватка ловится по сумме, а не по отдельной позиции", () => {
  // По 5 мл каждой позиции хватает, а вместе — нет. Проверка по позициям
  // пропустила бы это и продала воздух.
  const have = new Map([[1, 8]]);
  const short = shortages([line(1, 5, 1), line(1, 5, 1)], have);
  assert.equal(short.length, 1);
  assert.equal(short[0].needMl, 10);
  assert.equal(short[0].haveMl, 8);
});

test("когда всего хватает — нехватки нет", () => {
  assert.deepEqual(shortages([line(1, 5, 2)], new Map([[1, 10]])), []);
});

test("товара нет в остатках вовсе — это тоже нехватка", () => {
  const short = shortages([line(1, 5, 1)], new Map());
  assert.equal(short.length, 1);
  assert.equal(short[0].haveMl, 0);
});

test("сообщение называет аромат и остаток", () => {
  const msg = shortageMessage([
    { productId: 1, label: "Invictus", needMl: 10, haveMl: 4 },
  ]);
  assert.match(msg, /Invictus/);
  assert.match(msg, /осталось 4 мл/);
  assert.match(msg, /нужно 10/);
});

test("про закончившийся не пишем «осталось 0»", () => {
  const msg = shortageMessage([
    { productId: 1, label: "Sauvage", needMl: 5, haveMl: 0 },
  ]);
  assert.match(msg, /Sauvage — закончился/);
});

// ── Уведомление продавцам ───────────────────────────────────────────────────

test("тревога срабатывает один раз — на пересечении порога", () => {
  // Иначе уведомление уходило бы с каждой продажей подходящего к концу
  // флакона, и на него перестали бы смотреть.
  assert.equal(justRanLow(12, 7), true);
  assert.equal(justRanLow(7, 2), false, "уже был ниже порога — молчим");
  assert.equal(justRanLow(30, 25), false, "до порога далеко");
});

test("ровно на пороге ещё не тревога, а под ним — уже", () => {
  assert.equal(justRanLow(20, LOW_STOCK_ML), false);
  assert.equal(justRanLow(20, LOW_STOCK_ML - 1), true);
});

test("уход в ноль и в минус тоже тревога", () => {
  assert.equal(justRanLow(12, 0), true);
  assert.equal(justRanLow(12, -3), true);
});

test("текст уведомления понятен продавцу за прилавком", () => {
  assert.match(lowStockMessage("Paco Rabanne Invictus", 7), /остаток меньше 10 мл \(7 мл\)/);
  assert.match(lowStockMessage("Dior Sauvage", 0), /закончился/);
});
