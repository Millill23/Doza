/**
 * Тесты премии продавца.
 * Запуск: node --test packages/db/src/commission-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commissionPercent,
  commissionAmount,
  commissionProgress,
  COMMISSION_TIERS,
} from "./commission-rules.ts";

test("до первого порога премии нет", () => {
  assert.equal(commissionPercent(0), 0);
  assert.equal(commissionPercent(7999.99), 0);
  assert.equal(commissionAmount(7999.99), 0);
});

test("порог берётся ровно на своей сумме, а не после неё", () => {
  // Продавец, сделавший ровно восемь тысяч, план выполнил.
  assert.equal(commissionPercent(8000), 1);
  assert.equal(commissionPercent(10000), 2);
  assert.equal(commissionPercent(12000), 3);
});

test("процент считается от всей суммы, а не от превышения", () => {
  // 10 500 → это 2% от 10 500, а не 1% с двух тысяч плюс 2% с пятисот.
  assert.equal(commissionAmount(10500), 210);
  assert.equal(commissionAmount(8000), 80);
  assert.equal(commissionAmount(12000), 360);
});

test("выше последнего порога процент не растёт", () => {
  assert.equal(commissionPercent(50000), 3);
  assert.equal(commissionAmount(50000), 1500);
});

test("мусор на входе не ломает расчёт", () => {
  assert.equal(commissionAmount(NaN), 0);
  assert.equal(commissionAmount(-500), 0);
});

// ── Полоска ─────────────────────────────────────────────────────────────────

test("полоска идёт от ступени к ступени, а не от нуля до последней", () => {
  // Иначе первые восемь тысяч выглядели бы как две трети пути, хотя за них не
  // платят вовсе, а рывок с 10 до 12 тысяч почти не двигал бы полоску.
  const начало = commissionProgress(4000);
  assert.equal(начало.segmentFrom, 0);
  assert.equal(начало.segmentTo, 8000);
  assert.equal(начало.fill, 0.5);
  assert.equal(начало.nextPercent, 1);

  const середина = commissionProgress(9000);
  assert.equal(середина.segmentFrom, 8000);
  assert.equal(середина.segmentTo, 10000);
  assert.equal(середина.fill, 0.5);
  assert.equal(середина.nextPercent, 2);
});

test("на самом пороге полоска начинает новый отрезок пустой", () => {
  const p = commissionProgress(8000);
  assert.equal(p.percent, 1, "процент уже заработан");
  assert.equal(p.fill, 0, "но до следующей ступени ещё весь путь");
  assert.equal(p.nextPercent, 2);
  assert.equal(p.left, 2000);
});

test("сколько осталось до следующей ступени", () => {
  assert.equal(commissionProgress(7300).left, 700);
  assert.equal(commissionProgress(11500).left, 500);
});

test("все ступени взяты — полоска полная и расти некуда", () => {
  const p = commissionProgress(15000);
  assert.equal(p.fill, 1);
  assert.equal(p.nextPercent, null);
  assert.equal(p.nextAt, null);
  assert.equal(p.left, 0);
  assert.equal(p.percent, 3);
});

test("пустой месяц выглядит как начало пути, а не как ошибка", () => {
  const p = commissionProgress(0);
  assert.equal(p.fill, 0);
  assert.equal(p.percent, 0);
  assert.equal(p.amount, 0);
  assert.equal(p.nextAt, COMMISSION_TIERS[0].from);
});
