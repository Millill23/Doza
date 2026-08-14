/**
 * Тесты правил акций.
 * Запуск: node --test packages/db/src/promo-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickActivePromo, mergePromos, type PromoInput } from "./promo-rules.ts";

const NOW = new Date("2026-08-14T12:00:00Z");
const at = (iso: string) => new Date(iso);

const promo = (p: Partial<PromoInput>): PromoInput => ({
  discountPercent: null,
  cashbackPercent: null,
  startsAt: null,
  endsAt: null,
  ...p,
});

test("акция без дат действует всегда", () => {
  const r = pickActivePromo([promo({ discountPercent: 10 })], NOW);
  assert.equal(r.discountPercent, 10);
});

test("не начавшаяся и закончившаяся акции игнорируются", () => {
  const future = promo({ discountPercent: 30, startsAt: at("2026-09-01T00:00:00Z") });
  const past = promo({ discountPercent: 40, endsAt: at("2026-08-01T00:00:00Z") });
  assert.equal(pickActivePromo([future, past], NOW).discountPercent, 0);
});

test("границы периода включительно", () => {
  const startsNow = promo({ discountPercent: 10, startsAt: NOW });
  const endsNow = promo({ discountPercent: 20, endsAt: NOW });
  assert.equal(pickActivePromo([startsNow], NOW).discountPercent, 10);
  assert.equal(pickActivePromo([endsNow], NOW).discountPercent, 20);
});

test("из нескольких активных берётся большая скидка", () => {
  const r = pickActivePromo(
    [promo({ discountPercent: 10 }), promo({ discountPercent: 25 }), promo({ discountPercent: 5 })],
    NOW,
  );
  assert.equal(r.discountPercent, 25);
});

test("скидка и кешбек выбираются независимо", () => {
  // Акция может поднимать только кешбек, не трогая цену, — и наоборот.
  const r = pickActivePromo(
    [promo({ discountPercent: 20 }), promo({ cashbackPercent: 15 })],
    NOW,
  );
  assert.equal(r.discountPercent, 20);
  assert.equal(r.cashbackPercent, 15);
});

test("без акций с кешбеком возвращается null, а не ноль", () => {
  // null и 0 значат разное: null — «акция кешбек не задаёт, бери базовый»,
  // а 0 — «акция обнуляет кешбек». Их нельзя путать.
  assert.equal(pickActivePromo([promo({ discountPercent: 10 })], NOW).cashbackPercent, null);
  assert.equal(pickActivePromo([], NOW).cashbackPercent, null);
});

test("нулевой кешбек акции сохраняется как 0", () => {
  assert.equal(pickActivePromo([promo({ cashbackPercent: 0 })], NOW).cashbackPercent, 0);
});

test("merge берёт лучшее, а не сумму", () => {
  const r = mergePromos(
    { discountPercent: 10, cashbackPercent: 5 },
    { discountPercent: 15, cashbackPercent: 3 },
  );
  assert.equal(r.discountPercent, 15, "не 25");
  assert.equal(r.cashbackPercent, 5, "не 8");
});

test("merge сохраняет null, если кешбек не задан нигде", () => {
  const r = mergePromos(
    { discountPercent: 10, cashbackPercent: null },
    { discountPercent: 0, cashbackPercent: null },
  );
  assert.equal(r.cashbackPercent, null);
});

test("merge поднимает кешбек, если его задаёт только одна сторона", () => {
  assert.equal(
    mergePromos(
      { discountPercent: 0, cashbackPercent: null },
      { discountPercent: 0, cashbackPercent: 12 },
    ).cashbackPercent,
    12,
  );
  assert.equal(
    mergePromos(
      { discountPercent: 0, cashbackPercent: 7 },
      { discountPercent: 0, cashbackPercent: null },
    ).cashbackPercent,
    7,
  );
});
