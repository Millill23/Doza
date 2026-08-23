/**
 * Тесты стоимости доставки и порога бесплатной.
 * Запуск: node --test packages/db/src/delivery-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_FEE,
  FREE_DELIVERY_FROM,
  deliveryCost,
  freeDeliveryHint,
  isPostDelivery,
  needsPostalAddress,
  needsOffice,
} from "./delivery-rules.ts";

test("самовывоз ничего не стоит", () => {
  const c = deliveryCost({ type: "pickup", goodsTotal: 5 });
  assert.equal(c.fee, 0);
  assert.equal(c.free, true);
  assert.equal(freeDeliveryHint(c), null, "при самовывозе уговаривать не о чем");
});

test("почта дешевле порога стоит 10 рублей", () => {
  for (const type of ["belpochta", "europost"] as const) {
    const c = deliveryCost({ type, goodsTotal: 55 });
    assert.equal(c.fee, DELIVERY_FEE, type);
    assert.equal(c.free, false, type);
  }
});

test("от порога доставка бесплатна", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: FREE_DELIVERY_FROM });
  assert.equal(c.fee, 0);
  assert.equal(c.free, true);
  assert.equal(freeDeliveryHint(c), null, "уже бесплатно — молчим");
});

test("ровно на копейку ниже порога — платно", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: FREE_DELIVERY_FROM - 0.01 });
  assert.equal(c.fee, DELIVERY_FEE);
  assert.equal(c.missingForFree, 0.01);
});

test("подсказка называет, сколько не хватает", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: 55 });
  assert.equal(c.missingForFree, 45);
  assert.match(freeDeliveryHint(c), /45\.00/);
});

test("копейки в подсказке не размножаются", () => {
  const c = deliveryCost({ type: "europost", goodsTotal: 33.33 });
  assert.equal(c.missingForFree, 66.67);
});

test("пустая корзина не даёт отрицательных сумм", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: 0 });
  assert.equal(c.missingForFree, FREE_DELIVERY_FROM);
  assert.equal(c.fee, DELIVERY_FEE);
});

test("отрицательная сумма трактуется как ноль", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: -50 });
  assert.equal(c.missingForFree, FREE_DELIVERY_FROM);
});

// ── Какие поля спрашивать ───────────────────────────────────────────────────

test("почтой — да, самовывозом — нет", () => {
  assert.equal(isPostDelivery("pickup"), false);
  assert.equal(isPostDelivery("belpochta"), true);
  assert.equal(isPostDelivery("europost"), true);
});

test("Белпочте нужен адрес, Европочте — отделение", () => {
  // У Европочты посылку забирают в отделении, улица там ни к чему.
  assert.equal(needsPostalAddress("belpochta"), true);
  assert.equal(needsOffice("belpochta"), false);

  assert.equal(needsPostalAddress("europost"), false);
  assert.equal(needsOffice("europost"), true);
});

test("самовывозу не нужно ни то ни другое", () => {
  assert.equal(needsPostalAddress("pickup"), false);
  assert.equal(needsOffice("pickup"), false);
});

test("старые заказы «почтой» считаются адресными", () => {
  // Значение осталось в базе от времён, когда почта была одна.
  assert.equal(needsPostalAddress("post"), true);
  assert.equal(isPostDelivery("post"), true);
});
