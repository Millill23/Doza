/**
 * Тесты движка скидок. Запуск: node --test packages/db/src/pricing.test.ts
 * (Node 24 исполняет TypeScript напрямую.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
// Расширение .ts обязательно: файл исполняет node напрямую (ESM).
// Приложениями он не импортируется, поэтому сборке не мешает.
import {
  priceCart,
  effectiveCashbackPercent,
  type SuperPromoRule,
} from "./pricing.ts";

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

// ── Проверка правила «не суммировать и не накладывать» на конкретных цифрах ──
// Везде товар за 100, чтобы проценты читались напрямую.

test("акция 10% + подписки 10% = 10%, а НЕ 20%", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 10 },
    socialPercent: 10,
  });
  assert.equal(r.net, 90);
  assert.equal(r.discount, 10);
});

test("акция 5% + подписки 10% = 10% (выгоднее), а НЕ 15%", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 5 },
    socialPercent: 10,
  });
  assert.equal(r.net, 90);
  assert.equal(r.kind, "social");
});

test("акция 15% + VIP 20% = 20% (выгоднее), а НЕ 35%", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 15 },
    vipPercent: 20,
  });
  assert.equal(r.net, 80);
  assert.equal(r.kind, "vip");
});

test("акция 25% сильнее VIP 20% — берётся акция, а НЕ 45%", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 25 },
    vipPercent: 20,
  });
  assert.equal(r.net, 75);
  assert.equal(r.kind, "promo");
});

test("все три сразу (акция 15% + подписки 10% + VIP 20%) = 20%, а НЕ 45%", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 15 },
    socialPercent: 10,
    vipPercent: 20,
  });
  assert.equal(r.net, 80);
  assert.equal(r.kind, "vip");
});

test("«на все товары» 10% + адресная 15% = 15%, а НЕ 25%", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    allProductsPromoPercent: 10,
    productPromoPercent: { 1: 15 },
  });
  assert.equal(r.net, 85);
});

test("итоговая скидка никогда не превышает лучшую отдельную механику", () => {
  // перебор комбинаций: результат обязан совпасть с максимальным одиночным %
  for (const promo of [0, 5, 10, 15, 25]) {
    for (const social of [0, 5, 10]) {
      for (const vip of [0, 20]) {
        const r = priceCart({
          lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
          productPromoPercent: { 1: promo },
          socialPercent: social,
          vipPercent: vip,
        });
        const best = Math.max(promo, social, vip);
        assert.equal(
          r.net,
          100 - best,
          `promo=${promo} social=${social} vip=${vip}`,
        );
      }
    }
  }
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

// ── Кешбек: что обещано на витрине, то и начисляется ────────────────────────

test("кешбек: без акций — базовый процент", () => {
  assert.equal(effectiveCashbackPercent({ globalPercent: 5 }), 5);
});

test("кешбек: повышенный по акции заменяет базовый, а не складывается", () => {
  assert.equal(
    effectiveCashbackPercent({ globalPercent: 5, promoCashbackPercent: 15 }),
    15,
  );
});

test("кешбек: слабая акция не понижает базовый процент", () => {
  assert.equal(
    effectiveCashbackPercent({ globalPercent: 5, promoCashbackPercent: 3 }),
    5,
  );
});

test("кешбек: персональный процент товара учитывается", () => {
  assert.equal(
    effectiveCashbackPercent({ globalPercent: 5, productOverride: 10 }),
    10,
  );
});

test("кешбек: из трёх источников берётся максимум, а не сумма", () => {
  assert.equal(
    effectiveCashbackPercent({
      globalPercent: 5,
      productOverride: 10,
      promoCashbackPercent: 15,
    }),
    15,
  );
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

// ─── Скидка по памятной дате ──────────────────────────────────────────────

test("скидка по дате применяется, когда она лучшая", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    datePercent: 15,
  });
  assert.equal(r.net, 85);
  assert.equal(r.kind, "date");
});

test("VIP выгоднее — скидка по дате не тратится", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    vipPercent: 20,
    datePercent: 15,
  });
  assert.equal(r.net, 80);
  assert.equal(r.kind, "vip");
});

test("при равных процентах побеждает VIP, а не одноразовая скидка", () => {
  // Списать разовую скидку ради того же результата, что даёт карта, —
  // значит незаметно отобрать её у покупателя.
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    vipPercent: 15,
    datePercent: 15,
  });
  assert.equal(r.net, 85);
  assert.equal(r.kind, "vip");
});

test("скидка по дате не складывается с акцией товара", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 10 },
    datePercent: 15,
  });
  assert.equal(r.net, 85, "берётся максимум, а не 10% + 15%");
  assert.equal(r.kind, "date");
});

test("акция выгоднее скидки по дате — дата не тратится", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 30 },
    datePercent: 15,
  });
  assert.equal(r.net, 70);
  assert.equal(r.kind, "promo");
});

// ── Остаток во флаконе ──────────────────────────────────────────────────────
// Продавец ставит её вручную, когда флакон почти пуст. Своя механика, а не
// разновидность соцскидки: та даётся за действие покупателя и суммируется
// сама с собой, эта — за состояние товара.

test("скидка за остаток применяется ко всему чеку", () => {
  const r = priceCart({
    lines: [
      { productId: 1, qty: 1, unitPrice: 100 },
      { productId: 2, qty: 2, unitPrice: 50 },
    ],
    remnantPercent: 20,
  });
  assert.equal(r.net, 160); // 80 + 40*2
  assert.equal(r.kind, "remnant");
});

test("остаток не складывается с подписками", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    remnantPercent: 20,
    socialPercent: 10,
  });
  // 20%, а не 30%: иначе остаток у подписчика уходил бы за треть цены.
  assert.equal(r.net, 80);
  assert.equal(r.kind, "remnant");
});

test("остаток не складывается с VIP, но и не отменяет его", () => {
  // VIP даёт те же 20% — покупатель платит столько же, а не вдвое меньше.
  const равные = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    remnantPercent: 20,
    vipPercent: 20,
  });
  assert.equal(равные.net, 80);
  assert.equal(равные.kind, "vip", "при равенстве отчитываемся о праве клиента");

  // А если остаток щедрее — выигрывает он.
  const щедрее = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    remnantPercent: 30,
    vipPercent: 20,
  });
  assert.equal(щедрее.net, 70);
  assert.equal(щедрее.kind, "remnant");
});

test("остаток не складывается с акцией товара", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 15 },
    remnantPercent: 20,
  });
  assert.equal(r.net, 80, "берётся максимум, а не 15% + 20%");
  assert.equal(r.kind, "remnant");
});

test("акция выгоднее остатка — остаток не всплывает в отчёте", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    productPromoPercent: { 1: 40 },
    remnantPercent: 20,
  });
  assert.equal(r.net, 60);
  assert.equal(r.kind, "promo");
});

test("остаток вместе с датой: дата не тратится впустую", () => {
  // Одноразовую скидку по дате нельзя списывать ради результата, который уже
  // даёт остаток, — это молча отнимает у покупателя подарок.
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    remnantPercent: 20,
    datePercent: 20,
  });
  assert.equal(r.net, 80);
  assert.equal(r.kind, "remnant");
});

// ── Промокод ────────────────────────────────────────────────────────────────

test("промокод даёт скидку на весь чек", () => {
  const r = priceCart({
    lines: [
      { productId: 1, qty: 1, unitPrice: 100 },
      { productId: 2, qty: 2, unitPrice: 50 },
    ],
    promoCodePercent: 15,
  });
  assert.equal(r.net, 170); // 85 + 42.5*2
  assert.equal(r.kind, "promocode");
});

test("промокод не складывается ни с чем", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    promoCodePercent: 15,
    socialPercent: 10,
    productPromoPercent: { 1: 10 },
  });
  assert.equal(r.net, 85, "берётся максимум 15%, а не сумма");
  assert.equal(r.kind, "promocode");
});

test("VIP выгоднее промокода — платит меньше, а код не мешает", () => {
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    promoCodePercent: 10,
    vipPercent: 20,
  });
  assert.equal(r.net, 80);
  assert.equal(r.kind, "vip");
});

test("промокод не тратит одноразовую скидку по дате", () => {
  // При равенстве побеждает то, что ничего не стоит магазину на будущее.
  const r = priceCart({
    lines: [{ productId: 1, qty: 1, unitPrice: 100 }],
    promoCodePercent: 20,
    datePercent: 20,
  });
  assert.equal(r.net, 80);
  assert.equal(r.kind, "promocode");
});
