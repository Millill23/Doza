/**
 * Тесты движка скидок. Запуск: node --test packages/db/src/pricing.test.ts
 * (Node 24 исполняет TypeScript напрямую.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
// Расширение .ts обязательно: файл исполняет node напрямую (ESM).
// Приложениями он не импортируется, поэтому сборке не мешает.
import { priceCart, type SuperPromoRule } from "./pricing.ts";

const all: SuperPromoRule = { groupSize: 3, isEligible: () => true };

test("без скидок платим полную сумму", () => {
  const r = priceCart({ lines: [{ productId: 1, qty: 2, unitPrice: 10 }] });
  assert.equal(r.gross, 20);
  assert.equal(r.net, 20);
  assert.equal(r.kind, "none");
});

test("VIP 20% применяется ко всем позициям", () => {
  const r = priceCart({
    lines: [
      { productId: 1, qty: 1, unitPrice: 100 },
      { productId: 2, qty: 2, unitPrice: 50 },
    ],
    vipPercent: 20,
  });
  assert.equal(r.net, 160); // 80 + 40*2
  assert.equal(r.kind, "vip");
});

test("подписка + сторис = 10%, но не суммируется с VIP", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    vipPercent: 20,
    socialPercent: 10,
  });
  // максимум, а не 30%
  assert.equal(r.net, 80);
  assert.equal(r.kind, "vip");
});

test("акция товара выгоднее VIP — берётся акция", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    vipPercent: 20,
    productPromoPercent: { 1: 50 },
  });
  assert.equal(r.net, 50);
});

test("акция «на все товары» применяется к позиции без адресной акции", () => {
  const r = priceCart({
    lines: [
      { productId: 1, qty: 1, unitPrice: 100 },
      { productId: 2, qty: 1, unitPrice: 100 },
    ],
    allProductsPromoPercent: 10,
    productPromoPercent: { 2: 30 },
  });
  assert.equal(r.net, 160); // 90 + 70
  assert.equal(r.kind, "promo");
});

test("1+1=3: из трёх товаров самый дешёвый бесплатно", () => {
  const r = priceCart({
    lines: [
      { productId: 1, qty: 1, unitPrice: 30 },
      { productId: 2, qty: 1, unitPrice: 20 },
      { productId: 3, qty: 1, unitPrice: 10 },
    ],
    superPromo: all,
  });
  assert.equal(r.net, 50); // 60 − 10 (самый дешёвый)
  assert.equal(r.kind, "super");
  assert.equal(r.freeUnits, 1);
});

test("1+1=3 считает единицы внутри позиции с qty", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 3, unitPrice: 10 }],
    superPromo: all,
  });
  assert.equal(r.net, 20);
  assert.equal(r.freeUnits, 1);
});

test("1+1=3: шесть товаров — два бесплатно", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 6, unitPrice: 10 }],
    superPromo: all,
  });
  assert.equal(r.net, 40);
  assert.equal(r.freeUnits, 2);
});

test("двух товаров для 1+1=3 не хватает", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 2, unitPrice: 10 }],
    superPromo: all,
  });
  assert.equal(r.net, 20);
  assert.equal(r.freeUnits, 0);
});

test("в 1+1=3 участвуют только выбранные товары", () => {
  const rule: SuperPromoRule = { groupSize: 3, isEligible: (id) => id === 1 };
  const r = priceCart({
    lines: [
      { productId: 1, qty: 2, unitPrice: 10 },
      { productId: 2, qty: 5, unitPrice: 10 }, // не участвует
    ],
    superPromo: rule,
  });
  // участвующих единиц всего 2 → бесплатных нет
  assert.equal(r.freeUnits, 0);
  assert.equal(r.net, 70);
});

test("VIP не складывается с 1+1=3 — выигрывает то, что выгоднее покупателю", () => {
  // 3 товара по 100: VIP 20% → 240; 1+1=3 → 200. Побеждает супер-акция.
  const r = priceCart({
    lines: [{ productId: 1, qty: 3, unitPrice: 100 }],
    vipPercent: 20,
    superPromo: all,
  });
  assert.equal(r.net, 200);
  assert.equal(r.kind, "super");
});

test("VIP выгоднее слабой супер-акции — берётся VIP", () => {
  // 3 товара: 100+100+1. VIP 20% → 160.8; супер → 200. Побеждает VIP.
  const r = priceCart({
    lines: [
      { productId: 1, qty: 2, unitPrice: 100 },
      { productId: 2, qty: 1, unitPrice: 1 },
    ],
    vipPercent: 20,
    superPromo: all,
  });
  assert.equal(r.kind, "vip");
  assert.equal(r.net, 160.8);
});

test("соцскидка не складывается с 1+1=3", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 3, unitPrice: 100 }],
    socialPercent: 10,
    superPromo: all,
  });
  // соц → 270, супер → 200
  assert.equal(r.net, 200);
  assert.equal(r.kind, "super");
});

test("скидка никогда не делает сумму отрицательной", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 3, unitPrice: 0 }],
    vipPercent: 20,
    superPromo: all,
  });
  assert.equal(r.net, 0);
  assert.ok(r.discount >= 0);
});

test("пустой чек", () => {
  const r = priceCart({ lines: [] });
  assert.equal(r.net, 0);
  assert.equal(r.kind, "none");
});

test("копейки округляются корректно", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 3, unitPrice: 33.33 }],
    vipPercent: 20,
  });
  // 33.33*0.8 = 26.664 → 26.66 за штуку
  assert.equal(r.net, 79.98);
});

test("сумма позиций совпадает с итогом", () => {
  const r = priceCart({
    lines: [
      { productId: 1, qty: 2, unitPrice: 19.99 },
      { productId: 2, qty: 1, unitPrice: 5.55 },
      { productId: 3, qty: 3, unitPrice: 7.77 },
    ],
    superPromo: all,
  });
  const sum = Math.round(r.lineNet.reduce((s, v) => s + v, 0) * 100) / 100;
  assert.equal(sum, r.net);
});
