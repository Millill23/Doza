/**
 * Тесты допродажи перед оплатой.
 * Запуск: node --test packages/db/src/upsell-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UPSELL_PERCENT,
  isUpsellVolume,
  baseProductIds,
  upsellPercentFor,
  pickOffers,
} from "./upsell-rules.ts";
import { priceCart } from "./pricing.ts";

test("предлагаем 5 и 10 мл, пробник — нет", () => {
  assert.equal(isUpsellVolume(5), true);
  assert.equal(isUpsellVolume(10), true);
  assert.equal(isUpsellVolume(3), false, "3 мл — пробник, скидка на него не окупается");
});

// ── Кому положена скидка ────────────────────────────────────────────────────

const offered = new Set([42, 43]);

test("скидка даётся предложенному товару в предложенном объёме", () => {
  assert.equal(
    upsellPercentFor({ productId: 42, volumeMl: 5, fromUpsell: true }, offered),
    UPSELL_PERCENT,
  );
});

test("товар не из предложения скидки не получает", () => {
  // Главная защита: пометку «это допродажа» ставит браузер, а список
  // предложенного сервер строит сам.
  assert.equal(
    upsellPercentFor({ productId: 99, volumeMl: 5, fromUpsell: true }, offered),
    0,
  );
});

test("пометка без предложения ничего не даёт даже своему товару в 3 мл", () => {
  assert.equal(
    upsellPercentFor({ productId: 42, volumeMl: 3, fromUpsell: true }, offered),
    0,
  );
});

test("обычная позиция скидку допродажи не получает", () => {
  assert.equal(upsellPercentFor({ productId: 42, volumeMl: 5 }, offered), 0);
});

// ── Основа корзины ──────────────────────────────────────────────────────────

test("основа — то, что покупатель выбрал сам", () => {
  const lines = [
    { productId: 1, volumeMl: 10 },
    { productId: 2, volumeMl: 5, fromUpsell: true },
  ];
  assert.deepEqual(baseProductIds(lines), [1]);
});

test("пометив всю корзину, скидку не выпросишь", () => {
  // Основы не остаётся — предлагать не от чего, значит и предложения нет.
  const lines = [
    { productId: 1, volumeMl: 10, fromUpsell: true },
    { productId: 2, volumeMl: 5, fromUpsell: true },
  ];
  assert.deepEqual(baseProductIds(lines), []);
});

// ── Что показываем ──────────────────────────────────────────────────────────

test("то, что уже в корзине, не предлагаем", () => {
  const got = pickOffers(
    [{ productId: 1 }, { productId: 2 }, { productId: 3 }],
    [2],
  );
  assert.deepEqual(got, [1, 3]);
});

test("повторы схлопываются: аромат похож сразу на двоих из корзины", () => {
  const got = pickOffers([{ productId: 7 }, { productId: 7 }, { productId: 8 }], []);
  assert.deepEqual(got, [7, 8]);
});

test("сначала самые близкие", () => {
  const got = pickOffers(
    [
      { productId: 1, score: 0.2 },
      { productId: 2, score: 0.9 },
      { productId: 3, score: 0.5 },
    ],
    [],
  );
  assert.deepEqual(got, [2, 3, 1]);
});

test("список ограничен по длине", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ productId: i + 1 }));
  assert.equal(pickOffers(many, []).length, 5);
  assert.equal(pickOffers(many, [], 3).length, 3);
});

// ── Как считается чек ───────────────────────────────────────────────────────

test("скидка допродажи действует только на свою позицию", () => {
  const res = priceCart({
    lines: [
      { productId: 1, qty: 1, unitPrice: 100 },
      { productId: 2, qty: 1, unitPrice: 50, upsellPercent: UPSELL_PERCENT },
    ],
  });
  assert.equal(res.lineNet[0], 100, "основную позицию не трогаем");
  assert.equal(res.lineNet[1], 40, "50 − 20%");
  assert.equal(res.net, 140);
});

test("с VIP не складывается — берётся выгодное покупателю", () => {
  // И VIP, и допродажа дают 20%: платить покупатель должен 20%, а не 36%.
  const res = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100, upsellPercent: 20 }],
    vipPercent: 20,
  });
  assert.equal(res.net, 80);
});

test("если VIP выгоднее, побеждает он", () => {
  const res = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100, upsellPercent: 20 }],
    vipPercent: 30,
  });
  assert.equal(res.net, 70);
});

test("если акция на товар выгоднее, побеждает она", () => {
  const res = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100, upsellPercent: 20 }],
    productPromoPercent: { 1: 40 },
  });
  assert.equal(res.net, 60);
});
